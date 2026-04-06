import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import Company from "./company.model.js";
import Document from "../documents/document.model.js";
import User from "../users/user.model.js";
import bcrypt from "bcryptjs";
import { logHelper } from "../logs/log.service.js";
import { s3Config, uploadToS3, getSignedDownloadUrl, deleteFromS3 } from "../../config/s3.config.js";
import { dispatchNotificationByEvent } from "../notificacion/application/dispatchNotificationByEvent.service.js";
import { parseEnvEmailList } from "../notificacion/application/resolveRecipientEmails.js";
import { buildDatosPlantillaEntidad } from "./companyNotificationTemplate.helper.js";

const COMPANY_DOC_URL_FIELDS = [
  "chamberOfCommerceCertificate",
  "rutDocument",
  "agencyAccreditationDocument",
  "logo",
];

const COMPANIES_S3_PREFIX = (process.env.COMPANIES_S3_PREFIX || "companies-practicas").replace(/\/$/, "");

async function dispatchCompanyCreationNotifications({ company, userEmail, password, metadata = {} }) {
  try {
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
    const link = `${String(baseUrl).replace(/\/$/, "")}/#/login`;
    const usuario = userEmail || company?.contact?.email || company?.email || "";
    const context = {
      lider_practica: usuario,
      coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
      administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
      usuario,
      entidad: usuario,
    };

    const datosCompletos = buildDatosPlantillaEntidad(company, { userEmail: usuario, link, password });

    await dispatchNotificationByEvent({
      eventValue: "registro_entidad",
      tipo: "general",
      datos: {
        ...datosCompletos,
        CONTRASENA_TEMPORAL: "",
      },
      recipientContext: context,
      metadata,
    });

    await dispatchNotificationByEvent({
      eventValue: "envio_usuario_contrasena_entidad",
      tipo: "general",
      datos: datosCompletos,
      recipientContext: context,
      metadata,
    });
  } catch (err) {
    console.error("[companies] notificación de creación entidad:", err?.message || err);
  }
}

function safeExt(originalname, mimetype, fallback = ".bin") {
  const ext = path.extname(originalname || "").toLowerCase();
  if (ext && ext.length <= 8 && /^\.[a-z0-9]+$/i.test(ext)) return ext;
  if (/jpeg/i.test(mimetype || "")) return ".jpg";
  if (/png/i.test(mimetype || "")) return ".png";
  if (/gif/i.test(mimetype || "")) return ".gif";
  if (/webp/i.test(mimetype || "")) return ".webp";
  if (/pdf/i.test(mimetype || "")) return ".pdf";
  return fallback;
}

function normalizeIdDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function idTypesCompatible(lt, ct) {
  const a = String(lt || "").toUpperCase().trim();
  const b = String(ct || "").toUpperCase().trim();
  if (!a || !b) return true;
  return a === b;
}

/**
 * Misma persona que legalRepresentative (no usa isPrincipal):
 * 1) idNumber === identification (normalizado) y tipo compatible
 * 2) correo igual al R. legal (antes o después del guardado)
 * 3) primer contacto del array si no hay conflicto de documento con el R. legal
 */
function contactMatchesLegalRepresentative(c, legalRep, { oldLegalEmail, lrEmail, contactIndex }) {
  const ce = String(c.userEmail || "").toLowerCase().trim();
  const lrId = String(legalRep?.idNumber || "").trim();
  const cId = String(c.identification || "").trim();
  const ndL = normalizeIdDigits(lrId);
  const ndC = normalizeIdDigits(cId);
  if (ndL && ndC && ndL === ndC && idTypesCompatible(legalRep?.idType, c.idType)) {
    return true;
  }
  const matchesByEmail =
    (oldLegalEmail && ce === oldLegalEmail) || (lrEmail && ce === lrEmail);
  if (matchesByEmail) return true;
  if (contactIndex === 0) {
    if (ndL && ndC && idTypesCompatible(legalRep?.idType, c.idType) && ndL !== ndC) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Para PUT contacto: decide si este subdocumento es el R. legal y debe escribir en legalRepresentative.
 * Usa correo anterior del contacto (datosAnteriores) para no perder la vinculación al cambiar email.
 */
function shouldSyncContactToLegalRepresentative(
  contacto,
  lrBefore,
  datosAnteriores,
  contactIndex
) {
  const lrEm = String(lrBefore.email || "").toLowerCase().trim();
  const ce = String(contacto.userEmail || "").toLowerCase().trim();
  const prevMail = String(datosAnteriores.userEmail || "").toLowerCase().trim();
  const lrId = String(lrBefore.idNumber || "").trim();
  const cId = String(contacto.identification || "").trim();
  const ndL = normalizeIdDigits(lrId);
  const ndC = normalizeIdDigits(cId);
  if (ndL && ndC && ndL === ndC && idTypesCompatible(lrBefore.idType, contacto.idType)) {
    return true;
  }
  if (lrEm && (ce === lrEm || prevMail === lrEm)) return true;
  if (contactIndex === 0) {
    if (ndL && ndC && idTypesCompatible(lrBefore.idType, contacto.idType) && ndL !== ndC) {
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Sube logo + 3 documentos a S3 tras crear la empresa. Solo llamar cuando la empresa ya existe en BD.
 * @returns {Record<string, string>} campos a asignar en Company (keys S3)
 */
export async function uploadCompanyAssetsToS3(companyId, files) {
  const result = {};
  if (!files || !s3Config.isConfigured) return result;

  const id = String(companyId);
  const specs = [
    { field: "logo", slug: "logo", dbKey: "logo", imagesOnly: true },
    { field: "chamberOfCommerceCertificate", slug: "camara-comercio", dbKey: "chamberOfCommerceCertificate" },
    { field: "rutDocument", slug: "rut", dbKey: "rutDocument" },
    { field: "agencyAccreditationDocument", slug: "acreditacion-agencia", dbKey: "agencyAccreditationDocument" },
  ];

  for (const s of specs) {
    const arr = files[s.field];
    const file = Array.isArray(arr) ? arr[0] : arr;
    if (!file?.buffer?.length) continue;
    if (s.imagesOnly && !/^image\/(jpeg|png|gif|webp)$/i.test(file.mimetype)) continue;
    if (!s.imagesOnly && !/^(application\/pdf|image\/)/i.test(file.mimetype)) continue;
    const ext = safeExt(file.originalname, file.mimetype);
    const key = `${COMPANIES_S3_PREFIX}/${id}/${s.slug}${ext}`;
    await uploadToS3(key, file.buffer, { contentType: file.mimetype || "application/octet-stream" });
    result[s.dbKey] = key;
  }
  return result;
}

/** POST /companies/:id/initial-files (auth) — sube archivos solo tras crear la entidad */
export const uploadCompanyInitialFiles = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    }
    if (!s3Config.isConfigured) {
      return res.status(503).json({
        success: false,
        message: "Almacenamiento S3 no está configurado en el servidor. Los archivos no se guardaron.",
      });
    }
    const uploaded = await uploadCompanyAssetsToS3(company._id, req.files);
    if (Object.keys(uploaded).length === 0) {
      return res.json({
        success: true,
        message: "No se enviaron archivos o ninguno fue válido.",
        uploaded: {},
      });
    }
    Object.assign(company, uploaded);
    await company.save();
    res.json({
      success: true,
      message: "Archivos subidos correctamente.",
      uploaded,
    });
  } catch (err) {
    console.error("[uploadCompanyInitialFiles]", err);
    res.status(500).json({
      success: false,
      message: err.message || "Error al subir archivos",
    });
  }
};

/** Solo dígitos; acepta NIT escrito con puntos, guiones o espacios (ej. 900.123.456-7). */
function normalizeNitColombiaDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Validar NIT Colombia: 10 dígitos (9 base + 1 dígito de verificación), algoritmo módulo 11 DIAN */
function validarNitColombia(nit) {
  const str = normalizeNitColombiaDigits(nit);
  if (str.length !== 10) return false;
  const weights = [41, 37, 29, 23, 19, 17, 13, 7, 3];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(str[i], 10) * weights[i];
  }
  let digito = sum % 11;
  if (digito > 1) digito = 11 - digito;
  return parseInt(str[9], 10) === digito;
}

// Obtener todas las empresas
export const getCompanies = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      sector, 
      city,
      country,
      size,
      search 
    } = req.query;
    
    const filter = {};
    
    // Filtros exactos
    if (status) filter.status = status;
    if (sector) filter.sector = { $regex: sector, $options: "i" };
    if (city) filter.city = { $regex: city, $options: "i" };
    if (country) filter.country = { $regex: country, $options: "i" };
    if (size) filter.size = size;
    
    // Búsqueda por nombre de empresa únicamente
    if (search) {
      const searchRegex = { $regex: search, $options: "i" };
      filter.$or = [
        { name: searchRegex },
        { legalName: searchRegex },
        { commercialName: searchRegex },
      ];
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [companies, total] = await Promise.all([
      Company.find(filter)
        .populate("approvedBy", "name email")
        .limit(limitNum)
        .skip(skip)
        .sort({ createdAt: -1 })
        .lean(),
      Company.countDocuments(filter)
    ]);

    res.json({
      data: companies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener empresa por ID
export const getCompanyById = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id)
      .populate("approvedBy", "name email")
      .populate("contacts.userId", "name email estado");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    res.json(company);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** GET /companies/:id/document/:field — URL firmada (o URL absoluta) para revisar documentos en S3 */
export const getCompanyDocumentSignedUrl = async (req, res) => {
  try {
    const field = req.params.field;
    if (!COMPANY_DOC_URL_FIELDS.includes(field)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de documento no válido.",
      });
    }
    const company = await Company.findById(req.params.id).lean();
    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    }
    const key = company[field];
    if (!key || typeof key !== "string" || !String(key).trim()) {
      return res.status(404).json({
        success: false,
        message: "No hay archivo registrado.",
      });
    }
    const trimmed = String(key).trim();
    if (/^https?:\/\//i.test(trimmed)) {
      return res.json({ success: true, url: trimmed });
    }
    if (!s3Config.isConfigured) {
      return res.status(503).json({
        success: false,
        message: "Almacenamiento S3 no configurado; no se puede generar el enlace.",
      });
    }
    const url = await getSignedDownloadUrl(trimmed, 3600);
    return res.json({ success: true, url });
  } catch (err) {
    console.error("[getCompanyDocumentSignedUrl]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Error al generar enlace de descarga",
    });
  }
};

/** DELETE /companies/:id/document/:field — quita referencia en BD y borra objeto en S3 si aplica */
export const deleteCompanyDocument = async (req, res) => {
  try {
    const field = req.params.field;
    if (!COMPANY_DOC_URL_FIELDS.includes(field)) {
      return res.status(400).json({
        success: false,
        message: "Tipo de documento no válido.",
      });
    }
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ success: false, message: "Empresa no encontrada" });
    }
    const raw = company[field];
    if (raw == null || (typeof raw === "string" && !String(raw).trim())) {
      return res.json({ success: true, message: "No había archivo registrado." });
    }
    const trimmed = String(raw).trim();
    if (!/^https?:\/\//i.test(trimmed) && s3Config.isConfigured) {
      try {
        await deleteFromS3(trimmed);
      } catch (e) {
        console.error("[deleteCompanyDocument] S3:", e?.message || e);
      }
    }
    company[field] = "";
    await company.save();
    return res.json({ success: true, message: "Documento eliminado." });
  } catch (err) {
    console.error("[deleteCompanyDocument]", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Error al eliminar el documento",
    });
  }
};

// Crear nueva empresa
export const createCompany = async (req, res) => {
  try {
    // Preparar datos para guardar
    const companyData = {
      // Identificación y nombres
      name: req.body.name || req.body.legalName || '',
      legalName: req.body.legalName || '',
      commercialName: req.body.commercialName || '',
      idType: req.body.idType || 'NIT',
      idNumber: req.body.idNumber || '',
      nit: req.body.nit || req.body.idNumber || '',
      
      // Clasificaciones
      sector: req.body.sector || '',
      sectorMineSnies: req.body.sectorMineSnies || '',
      economicSector: req.body.economicSector || (Array.isArray(req.body.ciiuCodes) && req.body.ciiuCodes[0] ? req.body.ciiuCodes[0] : ''),
      ciiuCode: req.body.ciiuCode || (Array.isArray(req.body.ciiuCodes) && req.body.ciiuCodes[0] ? req.body.ciiuCodes[0] : ''),
      ciiuCodes: Array.isArray(req.body.ciiuCodes) ? req.body.ciiuCodes.slice(0, 3) : [],
      size: req.body.size || 'mediana',
      arl: req.body.arl || '',
      
      // Contacto y ubicación (el front a veces envía `direccion`)
      address: req.body.address || req.body.direccion || '',
      city: req.body.city || '',
      country: req.body.country || '',
      countryCode: req.body.countryCode || '',
      state: req.body.state || '',
      stateCode: req.body.stateCode || '',
      phone: req.body.phone || '',
      email: req.body.email || '',
      website: req.body.website || '',
      domain: req.body.domain || (Array.isArray(req.body.domains) && req.body.domains[0] ? req.body.domains[0] : ''),
      domains: Array.isArray(req.body.domains) ? req.body.domains.filter(Boolean) : [],
      linkedinUrl: req.body.linkedinUrl || '',
      
      // Contenidos
      description: req.body.description || '',
      missionVision: req.body.missionVision || '',
      
      // Logo y permisos
      logo: req.body.logo || '',
      authorizeLogoUsage: req.body.authorizeLogoUsage || false,
      
      // Reglas y capacidad
      canCreateOpportunities: req.body.canCreateOpportunities || false,
      operatesAsAgency: req.body.operatesAsAgency || false,
      wantsPracticeAgreement: req.body.wantsPracticeAgreement || false,
      programsOfInterest: req.body.programsOfInterest || [],
      
      // Documentos
      chamberOfCommerceCertificate: req.body.chamberOfCommerceCertificate || '',
      rutDocument: req.body.rutDocument || '',
      agencyAccreditationDocument: req.body.agencyAccreditationDocument || '',
      
      // Contacto principal - siempre es lo mismo que representante legal
      contact: {
        name: req.body.legalRepresentative?.firstName && req.body.legalRepresentative?.lastName
              ? `${req.body.legalRepresentative.firstName} ${req.body.legalRepresentative.lastName}`.trim()
              : req.body.contact?.name || '',
        position: req.body.contact?.position || '',
        phone: req.body.contact?.phone || req.body.phone || '',
        email: req.body.legalRepresentative?.email || req.body.contact?.email || ''
      },
      
      // Representante legal
      legalRepresentative: {
        firstName: req.body.legalRepresentative?.firstName || '',
        lastName: req.body.legalRepresentative?.lastName || '',
        email: req.body.legalRepresentative?.email || '',
        idType: req.body.legalRepresentative?.idType || 'CC',
        idNumber: req.body.legalRepresentative?.idNumber || ''
      },
      
      // Sedes
      branches: req.body.branches || []
    };

    // Validar que existan los datos del representante legal (mínimo 1 contacto obligatorio)
    if (!companyData.contact?.email || !companyData.contact?.name) {
      return res.status(400).json({ 
        success: false,
        message: 'El escenario de práctica debe tener al menos un contacto (representante legal). Complete nombre y correo del representante legal.' 
      });
    }

    // Validar que el correo del representante legal pertenezca a un dominio de la entidad (si se envían dominios)
    const createDomains = Array.isArray(req.body.domains) ? req.body.domains.filter(Boolean).map(d => String(d).replace(/^@/, '').toLowerCase().trim()) : [];
    if (createDomains.length > 0) {
      const repDomain = (companyData.contact.email || '').split('@')[1]?.toLowerCase();
      if (!repDomain || !createDomains.includes(repDomain)) {
        return res.status(400).json({
          success: false,
          message: `El correo del representante legal debe pertenecer a uno de los dominios de la entidad: ${createDomains.join(', ')}`
        });
      }
    }

    // Validar NIT Colombia (10 dígitos + dígito de verificación) cuando el tipo es NIT
    const tipoNit = (req.body.idType || companyData.idType || "").toUpperCase();
    if (tipoNit === "NIT" && (companyData.nit || companyData.idNumber)) {
      const nitLimpio = normalizeNitColombiaDigits(companyData.nit || companyData.idNumber);
      if (nitLimpio.length !== 10) {
        return res.status(400).json({
          success: false,
          message:
            "El NIT debe tener exactamente 10 dígitos (9 base + dígito de verificación). Puede escribirlo con o sin puntos o guiones (ej. 9001234567 o 900.123.456-7).",
        });
      }
      if (!validarNitColombia(nitLimpio)) {
        return res.status(400).json({
          success: false,
          message: "El dígito de verificación del NIT no es válido según el algoritmo de la DIAN (Colombia).",
        });
      }
      companyData.nit = nitLimpio;
      companyData.idNumber = nitLimpio;
    }

    // Verificar si ya existe un usuario con ese email antes de crear la empresa
    const emailToCheck = companyData.contact.email.toLowerCase();
    const userExistente = await User.findOne({ email: emailToCheck });
    if (userExistente) {
      return res.status(400).json({ 
        success: false,
        message: `Ya existe un usuario con el email ${emailToCheck}. Por favor use otro email.` 
      });
    }

    // Validar que el número de identificación tenga al menos 6 caracteres para la contraseña
    const password = companyData.idNumber || companyData.nit || '';
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'El número de identificación debe tener al menos 6 caracteres para generar la contraseña del usuario' 
      });
    }

    // Crear usuario primero - si falla, no se crea la empresa
    // Si la empresa está en pending_approval, el usuario debe estar inactivo (estado: false)
    let nuevoUser;
    try {
      const usuarioActivo = companyData.status === 'active';
      const emailLower = companyData.contact.email.toLowerCase();
      nuevoUser = new User({
        name: companyData.contact.name,
        email: emailLower,
        code: emailLower,
        password: await bcrypt.hash(password, 10),
        modulo: 'entidades',
        estado: usuarioActivo
      });
      await nuevoUser.save();
    } catch (userError) {
      // Manejo específico de errores del usuario
      if (userError.code === 11000) {
        return res.status(400).json({ 
          success: false,
          message: `Ya existe un usuario con el email ${companyData.contact.email}. Por favor use otro email.` 
        });
      }
      if (userError.name === 'ValidationError') {
        const errors = Object.values(userError.errors).map(e => e.message).join(', ');
        return res.status(400).json({ 
          success: false,
          message: `Error de validación al crear el usuario: ${errors}` 
        });
      }
      return res.status(500).json({ 
        success: false,
        message: `Error al crear el usuario: ${userError.message}` 
      });
    }

    // Si el usuario se creó exitosamente, crear la empresa
    // Agregar el contacto principal al array de contactos
    if (nuevoUser && companyData.contact?.name && companyData.contact?.email) {
      companyData.contacts = [{
        userId: nuevoUser._id,
        firstName: companyData.legalRepresentative?.firstName || companyData.contact.name.split(' ')[0] || '',
        lastName: companyData.legalRepresentative?.lastName || companyData.contact.name.split(' ').slice(1).join(' ') || '',
        alternateEmail: '',
        country: companyData.country || '',
        city: companyData.city || '',
        address: companyData.address || '',
        phone: companyData.contact.phone || companyData.phone || '',
        extension: '',
        mobile: companyData.phone || '',
        idType: companyData.legalRepresentative?.idType || 'CC',
        identification: companyData.legalRepresentative?.idNumber || companyData.idNumber || '',
        userEmail: companyData.contact.email.toLowerCase(),
        dependency: '',
        isPrincipal: true, // El contacto principal es el representante legal
        position: companyData.contact.position || '',
        isPracticeTutor: false,
        status: companyData.status === 'active' ? 'active' : 'inactive'
      }];
    }

    let company;
    try {
      company = await Company.create(companyData);
      await company.populate("approvedBy", "name email");
    } catch (companyError) {
      // Si falla la creación de la empresa, eliminar el usuario creado
      if (nuevoUser && nuevoUser._id) {
        try {
          await User.findByIdAndDelete(nuevoUser._id);
        } catch (deleteError) {
          console.error('Error al eliminar usuario tras fallo en creación de empresa:', deleteError);
        }
      }
      
      if (companyError.code === 11000) {
        return res.status(400).json({ 
          success: false,
          message: 'Ya existe una empresa con este NIT' 
        });
      }
      if (companyError.name === 'ValidationError') {
        const errors = Object.values(companyError.errors).map(e => e.message).join(', ');
        return res.status(400).json({ 
          success: false,
          message: `Error de validación al crear la empresa: ${errors}` 
        });
      }
      return res.status(500).json({ 
        success: false,
        message: `Error al crear la empresa: ${companyError.message}` 
      });
    }

    // Registrar log de creación
    await logHelper.crear(
      req,
      'CREATE',
      'companies',
      `Empresa creada: ${company.commercialName || company.name} (NIT: ${company.nit})`,
      company._id,
      null,
      {
        name: company.name,
        commercialName: company.commercialName,
        nit: company.nit,
        sector: company.sector,
        status: company.status
      },
      {
        usuarioCreado: nuevoUser ? nuevoUser._id : null,
        emailUsuario: companyData.contact.email
      }
    );

    await dispatchCompanyCreationNotifications({
      company,
      userEmail: companyData.contact?.email?.toLowerCase?.() || companyData.contact?.email || "",
      password,
      metadata: { companyId: String(company._id), source: "createCompany" },
    });

    res.status(201).json({
      success: true,
      message: 'Empresa y usuario creados exitosamente',
      data: company
    });
  } catch (error) {
    console.error('Error inesperado al crear empresa:', error);
    return res.status(500).json({ 
      success: false,
      message: `Error inesperado: ${error.message}` 
    });
  }
};

// Actualizar empresa
export const updateCompany = async (req, res) => {
  try {
    // Obtener empresa actual antes de actualizar
    const empresaAnterior = await Company.findById(req.params.id);
    if (!empresaAnterior) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Validar NIT Colombia si se está actualizando el NIT y el tipo es NIT
    const idTypeUpdate = req.body.idType !== undefined ? req.body.idType : empresaAnterior.idType;
    const nitUpdate = req.body.nit !== undefined ? req.body.nit : req.body.idNumber;
    const tipoNit = String(idTypeUpdate || '').toUpperCase();
    if (tipoNit === "NIT" && nitUpdate) {
      const nitStr = normalizeNitColombiaDigits(nitUpdate);
      if (nitStr.length !== 10) {
        return res.status(400).json({
          success: false,
          message:
            "El NIT debe tener exactamente 10 dígitos (9 base + dígito de verificación). Puede escribirlo con o sin puntos o guiones.",
        });
      }
      if (!validarNitColombia(nitStr)) {
        return res.status(400).json({
          success: false,
          message: 'El dígito de verificación del NIT no es válido según el algoritmo de la DIAN (Colombia).'
        });
      }
    }

    // Preparar datos para actualizar
    const updateData = {
      // Identificación y nombres
      ...(req.body.legalName !== undefined && { legalName: req.body.legalName }),
      ...(req.body.name !== undefined && { name: req.body.name || req.body.legalName || '' }),
      ...(req.body.commercialName !== undefined && { commercialName: req.body.commercialName }),
      ...(req.body.idType !== undefined && { idType: req.body.idType }),
      ...(req.body.idNumber !== undefined && { idNumber: req.body.idNumber }),
      ...(req.body.nit !== undefined && { nit: req.body.nit || req.body.idNumber }),
      
      // Clasificaciones
      ...(req.body.sector !== undefined && { sector: req.body.sector }),
      ...(req.body.sectorMineSnies !== undefined && { sectorMineSnies: req.body.sectorMineSnies }),
      ...(req.body.economicSector !== undefined && { economicSector: req.body.economicSector }),
      ...(req.body.ciiuCode !== undefined && { ciiuCode: req.body.ciiuCode }),
      ...(req.body.ciiuCodes !== undefined && { ciiuCodes: Array.isArray(req.body.ciiuCodes) ? req.body.ciiuCodes.slice(0, 3) : [] }),
      ...(req.body.size !== undefined && { size: req.body.size }),
      ...(req.body.arl !== undefined && { arl: req.body.arl }),
      
      // Contacto y ubicación
      ...(req.body.address !== undefined && { address: req.body.address }),
      ...(req.body.city !== undefined && { city: req.body.city }),
      ...(req.body.country !== undefined && { country: req.body.country }),
      ...(req.body.countryCode !== undefined && { countryCode: req.body.countryCode }),
      ...(req.body.state !== undefined && { state: req.body.state }),
      ...(req.body.stateCode !== undefined && { stateCode: req.body.stateCode }),
      ...(req.body.phone !== undefined && { phone: req.body.phone }),
      ...(req.body.email !== undefined && { email: req.body.email }),
      ...(req.body.website !== undefined && { website: req.body.website }),
      ...(req.body.domain !== undefined && { domain: req.body.domain }),
      ...(req.body.domains !== undefined && { domains: Array.isArray(req.body.domains) ? req.body.domains.filter(Boolean) : [] }),
      ...(req.body.linkedinUrl !== undefined && { linkedinUrl: req.body.linkedinUrl }),
      
      // Contenidos
      ...(req.body.description !== undefined && { description: req.body.description }),
      ...(req.body.missionVision !== undefined && { missionVision: req.body.missionVision }),
      
      // Logo y permisos
      ...(req.body.logo !== undefined && { logo: req.body.logo }),
      ...(req.body.authorizeLogoUsage !== undefined && { authorizeLogoUsage: req.body.authorizeLogoUsage }),
      
      // Reglas y capacidad
      ...(req.body.canCreateOpportunities !== undefined && { canCreateOpportunities: req.body.canCreateOpportunities }),
      ...(req.body.operatesAsAgency !== undefined && { operatesAsAgency: req.body.operatesAsAgency }),
      ...(req.body.wantsPracticeAgreement !== undefined && { wantsPracticeAgreement: req.body.wantsPracticeAgreement }),
      ...(req.body.programsOfInterest !== undefined && { programsOfInterest: req.body.programsOfInterest }),
      
      // Documentos
      ...(req.body.chamberOfCommerceCertificate !== undefined && { chamberOfCommerceCertificate: req.body.chamberOfCommerceCertificate }),
      ...(req.body.rutDocument !== undefined && { rutDocument: req.body.rutDocument }),
      ...(req.body.agencyAccreditationDocument !== undefined && { agencyAccreditationDocument: req.body.agencyAccreditationDocument }),
      
      // Contacto principal - siempre es lo mismo que representante legal
      ...((req.body.contact !== undefined || req.body.legalRepresentative !== undefined) && {
        contact: {
          name: (req.body.legalRepresentative?.firstName && req.body.legalRepresentative?.lastName
                  ? `${req.body.legalRepresentative.firstName} ${req.body.legalRepresentative.lastName}`.trim()
                  : req.body.contact?.name || empresaAnterior.contact?.name || ''),
          position: req.body.contact?.position || empresaAnterior.contact?.position || '',
          phone: req.body.contact?.phone || req.body.phone || empresaAnterior.contact?.phone || '',
          email: req.body.legalRepresentative?.email || req.body.contact?.email || empresaAnterior.contact?.email || ''
        }
      }),
      
      // Representante legal
      ...(req.body.legalRepresentative !== undefined && {
        legalRepresentative: {
          firstName: req.body.legalRepresentative.firstName || '',
          lastName: req.body.legalRepresentative.lastName || '',
          email: req.body.legalRepresentative.email || '',
          idType: req.body.legalRepresentative.idType || 'CC',
          idNumber: req.body.legalRepresentative.idNumber || ''
        }
      }),
      
      // Sedes
      ...(req.body.branches !== undefined && { branches: req.body.branches }),
      
      // Estado
      ...(req.body.status !== undefined && { status: req.body.status })
    };

    // Validar correo del representante legal contra dominios de la entidad (si hay dominios y se actualiza email)
    const effectiveDomains = (updateData.domains !== undefined ? updateData.domains : (empresaAnterior.domains || [])).map(d => String(d).replace(/^@/, '').toLowerCase().trim()).filter(Boolean);
    if (effectiveDomains.length > 0) {
      const newEmail = updateData.legalRepresentative?.email ?? updateData.contact?.email;
      if (newEmail) {
        const emailDom = newEmail.split('@')[1]?.toLowerCase();
        if (!emailDom || !effectiveDomains.includes(emailDom)) {
          return res.status(400).json({
            success: false,
            message: `El correo del representante legal debe pertenecer a uno de los dominios de la entidad: ${effectiveDomains.join(', ')}`
          });
        }
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    let company;
    try {
      company = await Company.findById(req.params.id).session(session);
      if (!company) {
        await session.abortTransaction();
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const oldLegalEmail = String(
        company.legalRepresentative?.email || company.contact?.email || ""
      )
        .toLowerCase()
        .trim();

      company.set(updateData);
      await company.validate();

      const lrEmail = String(
        company.legalRepresentative?.email || company.contact?.email || ""
      )
        .toLowerCase()
        .trim();
      const lrFn = company.legalRepresentative?.firstName || "";
      const lrLn = company.legalRepresentative?.lastName || "";
      const lrRep = company.legalRepresentative || {};

      for (let i = 0; i < company.contacts.length; i++) {
        const c = company.contacts[i];
        const ce = String(c.userEmail || "")
          .toLowerCase()
          .trim();
        const isLegalRepRow = contactMatchesLegalRepresentative(c, lrRep, {
          oldLegalEmail,
          lrEmail,
          contactIndex: i,
        });
        const matchesByEmail =
          (oldLegalEmail && ce === oldLegalEmail) || (lrEmail && ce === lrEmail);
        if (!isLegalRepRow && !matchesByEmail) continue;

        if (lrEmail && lrEmail !== ce) {
          const dup = await User.findOne({
            email: lrEmail,
            modulo: "entidades",
          }).session(session);
          if (dup && c.userId && String(dup._id) !== String(c.userId)) {
            await session.abortTransaction();
            return res.status(400).json({
              success: false,
              message:
                "El correo del representante legal ya está en uso por otro usuario de entidades.",
            });
          }
        }

        if (isLegalRepRow) {
          if (lrEmail) c.userEmail = lrEmail;
          const idn = lrRep.idNumber;
          if (idn != null && String(idn).trim() !== "") {
            c.identification = String(idn).trim();
          }
          if (lrRep.idType) c.idType = lrRep.idType;
        } else if (
          oldLegalEmail &&
          lrEmail &&
          ce === oldLegalEmail &&
          lrEmail !== oldLegalEmail
        ) {
          c.userEmail = lrEmail;
        }
        c.firstName = lrFn;
        c.lastName = lrLn;

        if (c.userId && lrEmail) {
          const u = await User.findById(c.userId).session(session);
          if (u) {
            u.email = lrEmail;
            u.code = lrEmail;
            u.name = `${lrFn} ${lrLn}`.trim();
            await u.save({ session });
          }
        }
      }

      if (req.body.status !== undefined && company.contacts && company.contacts.length > 0) {
        const nuevoEstadoUsuario = company.status === "active";
        for (const c of company.contacts) {
          c.status = nuevoEstadoUsuario ? "active" : "inactive";
          if (c.userId) {
            await User.findByIdAndUpdate(
              c.userId,
              { estado: nuevoEstadoUsuario },
              { session }
            );
          }
        }
      }

      await company.save({ session });
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      if (err.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Ya existe un usuario con ese correo en el sistema.",
        });
      }
      throw err;
    } finally {
      session.endSession();
    }

    company = await Company.findById(req.params.id).populate("approvedBy", "name email");
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Registrar log de actualización
    await logHelper.crear(
      req,
      'UPDATE',
      'companies',
      `Empresa actualizada: ${company.commercialName || company.name} (NIT: ${company.nit})`,
      company._id,
      {
        name: empresaAnterior.name,
        commercialName: empresaAnterior.commercialName,
        status: empresaAnterior.status,
        sector: empresaAnterior.sector
      },
      {
        name: company.name,
        commercialName: company.commercialName,
        status: company.status,
        sector: company.sector
      }
    );

    res.json(company);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: "Ya existe una empresa con este NIT" });
    }
    res.status(500).json({ message: error.message });
  }
};

// Eliminar empresa
export const deleteCompany = async (req, res) => {
  try {
    // Obtener empresa antes de eliminar para el log
    const company = await Company.findById(req.params.id);
    
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    await Company.findByIdAndDelete(req.params.id);

    // Registrar log de eliminación
    await logHelper.crear(
      req,
      'DELETE',
      'companies',
      `Empresa eliminada: ${company.commercialName || company.name} (NIT: ${company.nit})`,
      company._id,
      {
        name: company.name,
        commercialName: company.commercialName,
        nit: company.nit,
        sector: company.sector
      },
      null
    );

    res.json({ message: "Empresa eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Aprobar empresa
export const approveCompany = async (req, res) => {
  try {
    // Obtener empresa antes de aprobar
    const empresaAnterior = await Company.findById(req.params.id);
    if (!empresaAnterior) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      {
        status: "active",
        approvedBy: req.user.id,
        approvedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate("approvedBy", "name email");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Actualizar el estado de todos los usuarios asociados (contactos) a activo cuando se aprueba la empresa
    if (empresaAnterior.contacts && empresaAnterior.contacts.length > 0) {
      for (const contacto of empresaAnterior.contacts) {
        if (contacto.userId) {
          await User.findByIdAndUpdate(contacto.userId, { estado: true });
        }
      }
      // Actualizar el estado de los contactos en el array
      company.contacts = company.contacts.map(contacto => ({
        ...contacto.toObject ? contacto.toObject() : contacto,
        status: 'active'
      }));
      await company.save();
    }

    // Registrar log de aprobación
    await logHelper.crear(
      req,
      'APPROVE',
      'companies',
      `Empresa aprobada: ${company.commercialName || company.name} (NIT: ${company.nit})`,
      company._id,
      {
        status: empresaAnterior.status
      },
      {
        status: company.status,
        approvedBy: company.approvedBy?._id,
        approvedAt: company.approvedAt
      }
    );

    res.json({ 
      message: "Empresa aprobada correctamente",
      company 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ========== GESTIÓN DE CONTACTOS ==========

// Agregar contacto a una empresa
export const addContact = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const {
      firstName,
      lastName,
      alternateEmail,
      country,
      countryCode,
      state,
      stateCode,
      city,
      address,
      phone,
      extension,
      mobile,
      idType,
      identification,
      userEmail,
      dependency,
      isPrincipal,
      position,
      isPracticeTutor
    } = req.body;

    // Validar campos requeridos
    if (!firstName || !lastName || !userEmail) {
      return res.status(400).json({ 
        message: "Nombre, apellido y email de usuario son obligatorios" 
      });
    }

    // Máximo 8 contactos por escenario (representante legal + hasta 7 adicionales)
    if (company.contacts.length >= 8) {
      return res.status(400).json({ 
        message: "Máximo 8 contactos por escenario de práctica (incluye representante legal)." 
      });
    }

    // Verificar si ya existe un contacto con ese email
    const contactoExistente = company.contacts.find(
      c => c.userEmail.toLowerCase() === userEmail.toLowerCase()
    );
    if (contactoExistente) {
      return res.status(400).json({ 
        message: "Ya existe un contacto con ese email de usuario" 
      });
    }

    // Validar que el correo del contacto pertenezca a uno de los dominios de la entidad (si hay dominios configurados)
    const allowedDomains = (company.domains || []).map(d => String(d).replace(/^@/, '').toLowerCase().trim()).filter(Boolean);
    if (allowedDomains.length > 0) {
      const emailDomain = (userEmail || '').split('@')[1]?.toLowerCase();
      if (!emailDomain || !allowedDomains.includes(emailDomain)) {
        return res.status(400).json({
          message: `El correo del contacto debe pertenecer a uno de los dominios registrados para la entidad: ${allowedDomains.join(', ')}`
        });
      }
    }

    // Buscar o crear usuario
    let usuario = await User.findOne({ 
      email: userEmail.toLowerCase(),
      modulo: 'entidades'
    });

    if (!usuario) {
      // Crear nuevo usuario si no existe
      const password = identification || Math.random().toString(36).slice(-8);
      if (password.length < 6) {
        return res.status(400).json({ 
          message: "La identificación debe tener al menos 6 caracteres para generar la contraseña" 
        });
      }

      const emailLower = userEmail.toLowerCase();
      usuario = new User({
        name: `${firstName} ${lastName}`,
        email: emailLower,
        code: emailLower,
        password: await bcrypt.hash(password, 10),
        modulo: 'entidades',
        estado: company.status === 'active'
      });
      await usuario.save();
    }

    // Crear nuevo contacto
    const nuevoContacto = {
      userId: usuario._id,
      firstName,
      lastName,
      alternateEmail: alternateEmail || '',
      country: country || '',
      countryCode: countryCode || '',
      state: state || '',
      stateCode: stateCode || '',
      city: city || '',
      address: address || '',
      phone: phone || '',
      extension: extension || '',
      mobile: mobile || '',
      idType: idType || 'CC',
      identification: identification || '',
      userEmail: userEmail.toLowerCase(),
      dependency: dependency || '',
      isPrincipal: isPrincipal || false,
      position: position || '',
      isPracticeTutor: isPracticeTutor || false,
      status: company.status === 'active' ? 'active' : 'inactive'
    };

    // Si se marca como principal, quitar el flag de otros contactos
    if (isPrincipal) {
      company.contacts.forEach(contacto => {
        contacto.isPrincipal = false;
      });
    }

    company.contacts.push(nuevoContacto);
    await company.save();

    // Registrar log
    await logHelper.crear(
      req,
      'CREATE',
      'companies',
      `Contacto agregado a empresa: ${company.commercialName || company.name} - ${firstName} ${lastName}`,
      company._id,
      null,
      { contacto: nuevoContacto },
      { accion: 'agregar_contacto' }
    );

    if (isPracticeTutor === true || isPracticeTutor === "true") {
      try {
        const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173";
        const link = `${String(baseUrl).replace(/\/$/, "")}/#/`;
        await dispatchNotificationByEvent({
          eventValue: "creacion_tutores",
          tipo: "general",
          datos: {
            NOMBRE_TUTOR: `${firstName} ${lastName}`.trim(),
            PROGRAMA: position || "—",
            LINK: link,
            COMENTARIO: `Tutor de práctica — entidad ${company.commercialName || company.name || ""}`,
          },
          recipientContext: {
            coordinador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_COORDINADOR),
            administrador: parseEnvEmailList(process.env.NOTIFICATION_EMAILS_ADMIN),
          },
          metadata: { companyId: String(company._id), source: "addContact_tutor_practica" },
        });
      } catch (e) {
        console.error("[companies] creacion_tutores notificación:", e?.message || e);
      }
    }

    res.json({
      message: "Contacto agregado correctamente",
      contact: nuevoContacto
    });
  } catch (error) {
    console.error('Error al agregar contacto:', error);
    res.status(500).json({ message: error.message });
  }
};

// Actualizar contacto
export const updateContact = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const company = await Company.findById(req.params.id).session(session);
    if (!company) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const contactId = req.params.contactId;
    const contacto = company.contacts.id(contactId);
    if (!contacto) {
      await session.abortTransaction();
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    const datosAnteriores = { ...contacto.toObject() };
    const oldEmail = String(contacto.userEmail || "")
      .toLowerCase()
      .trim();
    const lrBefore =
      company.legalRepresentative &&
      typeof company.legalRepresentative.toObject === "function"
        ? company.legalRepresentative.toObject()
        : { ...(company.legalRepresentative || {}) };
    const lrBeforeMerged = {
      ...lrBefore,
      email: lrBefore.email || company.contact?.email || "",
    };
    const contactIndex = company.contacts.findIndex(
      (x) => x._id.toString() === contactId
    );

    const camposPermitidos = [
      "firstName",
      "lastName",
      "alternateEmail",
      "country",
      "countryCode",
      "state",
      "stateCode",
      "city",
      "address",
      "phone",
      "extension",
      "mobile",
      "idType",
      "identification",
      "userEmail",
      "dependency",
      "isPrincipal",
      "position",
      "isPracticeTutor",
      "status",
    ];

    camposPermitidos.forEach((campo) => {
      if (req.body[campo] !== undefined) {
        if (campo === "userEmail" && typeof req.body[campo] === "string") {
          contacto[campo] = req.body[campo].toLowerCase().trim();
        } else {
          contacto[campo] = req.body[campo];
        }
      }
    });

    const allowedDomains = (company.domains || [])
      .map((d) => String(d).replace(/^@/, "").toLowerCase().trim())
      .filter(Boolean);
    if (allowedDomains.length > 0 && contacto.userEmail) {
      const dom = contacto.userEmail.split("@")[1]?.toLowerCase();
      if (!dom || !allowedDomains.includes(dom)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `El correo del contacto debe pertenecer a uno de los dominios de la entidad: ${allowedDomains.join(", ")}`,
        });
      }
    }

    if (req.body.isPrincipal && !datosAnteriores.isPrincipal) {
      company.contacts.forEach((c) => {
        if (c._id.toString() !== contactId) {
          c.isPrincipal = false;
        }
      });
    }

    if (
      shouldSyncContactToLegalRepresentative(
        contacto,
        lrBeforeMerged,
        datosAnteriores,
        contactIndex
      )
    ) {
      const fn = (contacto.firstName || "").trim();
      const ln = (contacto.lastName || "").trim();
      const em = String(contacto.userEmail || "").toLowerCase().trim();
      const lrObj = { ...lrBeforeMerged };
      company.legalRepresentative = {
        ...lrObj,
        firstName: fn,
        lastName: ln,
        email: em,
        idType: contacto.idType || lrObj.idType || "CC",
        idNumber: contacto.identification || lrObj.idNumber || "",
      };
      const ct = company.contact || {};
      const ctObj =
        ct && typeof ct.toObject === "function" ? ct.toObject() : { ...ct };
      company.contact = {
        ...ctObj,
        name: `${fn} ${ln}`.trim(),
        email: em,
        phone: contacto.phone || ctObj.phone || company.phone || "",
      };
      company.markModified("legalRepresentative");
      company.markModified("contact");
    }

    const newEmail = String(contacto.userEmail || "")
      .toLowerCase()
      .trim();

    if (contacto.userId) {
      const u = await User.findById(contacto.userId).session(session);
      if (u) {
        if (req.body.userEmail !== undefined && newEmail !== oldEmail) {
          const dup = await User.findOne({
            email: newEmail,
            modulo: "entidades",
          }).session(session);
          if (dup && String(dup._id) !== String(u._id)) {
            await session.abortTransaction();
            return res.status(400).json({
              message: "Ya existe otro usuario de entidades con ese correo.",
            });
          }
          u.email = newEmail;
          u.code = newEmail;
        }
        if (
          req.body.firstName !== undefined ||
          req.body.lastName !== undefined
        ) {
          u.name = `${contacto.firstName} ${contacto.lastName}`.trim();
        }
        if (req.body.status !== undefined) {
          u.estado = req.body.status === "active";
        }
        await u.save({ session });
      }
    }

    await company.save({ session });
    await session.commitTransaction();

    await logHelper.crear(
      req,
      "UPDATE",
      "companies",
      `Contacto actualizado: ${company.commercialName || company.name} - ${contacto.firstName} ${contacto.lastName}`,
      company._id,
      datosAnteriores,
      { ...contacto.toObject() },
      { accion: "actualizar_contacto" }
    );

    res.json({
      message: "Contacto actualizado correctamente",
      contact: contacto,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error al actualizar contacto:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Ya existe un usuario con ese correo en el sistema.",
      });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// Eliminar contacto
export const deleteContact = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const contactId = req.params.contactId;
    const contacto = company.contacts.id(contactId);
    if (!contacto) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    const datosContacto = { ...contacto.toObject() };

    // No eliminar el usuario, solo remover la relación
    // (el usuario puede seguir existiendo en el sistema)

    company.contacts.pull(contactId);
    await company.save();

    // Registrar log
    await logHelper.crear(
      req,
      'DELETE',
      'companies',
      `Contacto eliminado: ${company.commercialName || company.name} - ${contacto.firstName} ${contacto.lastName}`,
      company._id,
      datosContacto,
      null,
      { accion: 'eliminar_contacto' }
    );

    res.json({ message: "Contacto eliminado correctamente" });
  } catch (error) {
    console.error('Error al eliminar contacto:', error);
    res.status(500).json({ message: error.message });
  }
};

// Resetear contraseña de contacto
export const resetContactPassword = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const contactId = req.params.contactId;
    const contacto = company.contacts.id(contactId);
    if (!contacto || !contacto.userId) {
      return res.status(404).json({ message: "Contacto no encontrado o sin usuario asociado" });
    }

    const user = await User.findById(contacto.userId);
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    if (user.modulo !== "entidades") {
      return res.status(400).json({
        message: "Solo se puede restablecer la contraseña de usuarios del módulo entidades.",
      });
    }

    const idStr = String(contacto.identification || "").trim();
    const useIdentificationAsTemp =
      idStr.length >= 6 && idStr.length <= 128;
    const nuevaPassword = useIdentificationAsTemp
      ? idStr
      : crypto.randomBytes(12).toString("base64url");

    await User.findByIdAndUpdate(
      contacto.userId,
      {
        password: await bcrypt.hash(nuevaPassword, 10),
        debeCambiarPassword: true,
      },
      { runValidators: true }
    );

    await logHelper.crear(
      req,
      "UPDATE",
      "companies",
      `Contraseña reseteada para contacto: ${company.commercialName || company.name} - ${contacto.firstName} ${contacto.lastName}`,
      company._id,
      null,
      {
        accion: "resetear_contraseña_contacto",
        contactoId,
        tempFromIdentification: useIdentificationAsTemp,
      },
      { accion: "resetear_contraseña_contacto", contactoId }
    );

    res.json({
      message: "Contraseña reseteada correctamente. El usuario deberá cambiarla al iniciar sesión.",
      password: nuevaPassword,
    });
  } catch (error) {
    console.error("Error al resetear contraseña:", error);
    res.status(500).json({ message: error.message });
  }
};

// Subir logo
export const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No se proporcionó archivo" });
    }

    const company = await Company.findById(req.params.id);
    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Crear registro de documento
    const document = await Document.create({
      name: `Logo - ${company.name}`,
      type: "other",
      category: "company",
      file: {
        originalName: req.file.originalname,
        fileName: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype
      },
      relatedTo: {
        company: company._id
      },
      uploadedBy: req.user.id,
      status: "approved"
    });

    // Actualizar logo en la empresa
    company.logo = req.file.path;
    await company.save();

    res.json({ 
      message: "Logo subido correctamente",
      document,
      logoPath: company.logo
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// REGISTRO PÚBLICO DE ESCENARIO DE PRÁCTICA (sin autenticación)
// ============================================================

// Rate limiting en memoria: máximo 5 registros por IP cada 24 horas
const _publicRegRateMap = new Map();
const _PUBLIC_REG_MAX = 5;
const _PUBLIC_REG_WINDOW_MS = 24 * 60 * 60 * 1000;

function checkPublicRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - _PUBLIC_REG_WINDOW_MS;
  const times = (_publicRegRateMap.get(ip) || []).filter(t => t > windowStart);
  if (times.length >= _PUBLIC_REG_MAX) return false;
  times.push(now);
  _publicRegRateMap.set(ip, times);
  return true;
}

export const publicRegisterCompany = async (req, res) => {
  try {
    // Rate limiting por IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (!checkPublicRateLimit(clientIp)) {
      return res.status(429).json({
        success: false,
        message: 'Has superado el límite de registros permitidos por día. Intenta mañana o contacta al administrador.'
      });
    }

    // Honeypot anti-bot: si viene el campo oculto relleno, es un bot
    if (req.body._hp && String(req.body._hp).trim() !== '') {
      return res.status(400).json({ success: false, message: 'Registro inválido.' });
    }

    // Preparar datos básicos
    const legalName = (req.body.legalName || req.body.name || '').trim();
    const idType = (req.body.idType || 'NIT').trim();
    const nit = normalizeNitColombiaDigits(req.body.nit || req.body.idNumber || "");

    if (!legalName) {
      return res.status(400).json({ success: false, message: 'La razón social es requerida.' });
    }
    if (!nit) {
      return res.status(400).json({ success: false, message: 'El número de identificación es requerido.' });
    }

    // Validar NIT Colombia
    if (idType.toUpperCase() === 'NIT') {
      if (nit.length !== 10) {
        return res.status(400).json({
          success: false,
          message:
            "El NIT debe tener exactamente 10 dígitos (9 base + dígito de verificación). Puede escribirlo con o sin puntos o guiones (ej. 9001234567 o 900.123.456-7).",
        });
      }
      if (!validarNitColombia(nit)) {
        return res.status(400).json({ success: false, message: 'El dígito de verificación del NIT no es válido según el algoritmo de la DIAN.' });
      }
    }

    // Verificar NIT único
    const nitExistente = await Company.findOne({ nit });
    if (nitExistente) {
      return res.status(400).json({ success: false, message: 'Ya existe una entidad registrada con ese NIT.' });
    }

    const commercialName = (req.body.commercialName || '').trim();
    if (!commercialName) {
      return res.status(400).json({ success: false, message: 'El nombre comercial es requerido.' });
    }
    const sectorMineSniesVal = (req.body.sectorMineSnies || '').trim();
    if (!sectorMineSniesVal) {
      return res.status(400).json({ success: false, message: 'El sector MinE (SNIES) es requerido.' });
    }
    let ciiuCodes = [];
    if (req.body.ciiuCodes) {
      try {
        ciiuCodes =
          typeof req.body.ciiuCodes === 'string' ? JSON.parse(req.body.ciiuCodes) : req.body.ciiuCodes;
      } catch {
        ciiuCodes = [];
      }
    }
    if (!Array.isArray(ciiuCodes)) ciiuCodes = [];
    ciiuCodes = ciiuCodes.filter(Boolean);
    if (ciiuCodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Debe seleccionar al menos un código CIIU (sector económico).',
      });
    }

    const MIN_DOC_BYTES = 1024 * 1024;
    const fileChamber = req.files?.chamberOfCommerceCertificate?.[0];
    const fileRut = req.files?.rutDocument?.[0];
    if (!fileChamber?.buffer?.length) {
      return res.status(400).json({
        success: false,
        message: 'Debe adjuntar el certificado de cámara de comercio.',
      });
    }
    if (!fileRut?.buffer?.length) {
      return res.status(400).json({
        success: false,
        message: 'Debe adjuntar el documento RUT.',
      });
    }
    if (fileChamber.buffer.length < MIN_DOC_BYTES) {
      return res.status(400).json({
        success: false,
        message: 'El certificado de cámara de comercio debe tener un tamaño mínimo de 1 MB.',
      });
    }
    if (fileRut.buffer.length < MIN_DOC_BYTES) {
      return res.status(400).json({
        success: false,
        message: 'El documento RUT debe tener un tamaño mínimo de 1 MB.',
      });
    }

    // Representante legal (puede llegar como objeto JSON o como campos planos de FormData)
    let legalRepBody = req.body.legalRepresentative || {};
    if (typeof legalRepBody === 'string') { try { legalRepBody = JSON.parse(legalRepBody); } catch { legalRepBody = {}; } }
    const repFirstName = (legalRepBody.firstName || '').trim();
    const repLastName  = (legalRepBody.lastName  || '').trim();
    const repEmail     = (legalRepBody.email     || '').toLowerCase().trim();
    const repPhone     = (legalRepBody.phone || req.body.phone || '').trim();

    if (!repFirstName || !repLastName || !repEmail) {
      return res.status(400).json({ success: false, message: 'El nombre, apellido y correo del representante legal son requeridos.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(repEmail)) {
      return res.status(400).json({ success: false, message: 'El correo del representante legal no tiene un formato válido.' });
    }

    const userExistente = await User.findOne({ email: repEmail });
    if (userExistente) {
      return res.status(400).json({ success: false, message: `Ya existe un usuario con el correo ${repEmail}.` });
    }

    // Crear usuario inactivo para el representante legal (activa cuando el admin apruebe)
    const hashedPassword = await bcrypt.hash(nit, 10);
    let nuevoUser;
    try {
      nuevoUser = new User({
        name: `${repFirstName} ${repLastName}`.trim(),
        email: repEmail,
        code: repEmail,
        password: hashedPassword,
        modulo: 'entidades',
        estado: false,
        debeCambiarPassword: true
      });
      await nuevoUser.save();
    } catch (userError) {
      if (userError.code === 11000) {
        return res.status(400).json({ success: false, message: `Ya existe un usuario con el correo ${repEmail}.` });
      }
      return res.status(500).json({ success: false, message: `Error al crear el usuario: ${userError.message}` });
    }

    // Contactos adicionales (puede llegar como JSON string en FormData)
    let extraContacts = req.body.extraContacts || [];
    if (typeof extraContacts === 'string') { try { extraContacts = JSON.parse(extraContacts); } catch { extraContacts = []; } }
    if (!Array.isArray(extraContacts)) extraContacts = [];
    extraContacts = extraContacts.slice(0, 7);
    const contactsArray = [{
      userId: nuevoUser._id,
      firstName: repFirstName,
      lastName: repLastName,
      userEmail: repEmail,
      phone: repPhone,
      country: req.body.country || 'Colombia',
      city: req.body.city || '',
      address: req.body.address || '',
      idType: legalRepBody.idType || 'CC',
      identification: legalRepBody.idNumber || '',
      isPrincipal: true,
      status: 'active'
    }];

    // Crear usuario para cada contacto adicional
    for (const ec of extraContacts) {
      const ecFirstName = (ec.firstName || '').trim();
      const ecLastName  = (ec.lastName  || '').trim();
      const ecEmail     = (ec.email     || '').toLowerCase().trim();
      if (!ecFirstName || !ecLastName || !ecEmail) continue;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ecEmail)) continue;

      let ecUserId = null;
      try {
        const ecUser = new User({
          name: `${ecFirstName} ${ecLastName}`.trim(),
          email: ecEmail,
          code: ecEmail,
          password: hashedPassword, // misma contraseña inicial (NIT)
          modulo: 'entidades',
          estado: false,
          debeCambiarPassword: true
        });
        await ecUser.save();
        ecUserId = ecUser._id;
      } catch (ecErr) {
        // Si el email ya existe simplemente omitimos crear usuario pero sí agregamos el contacto
        if (ecErr.code !== 11000) {
          console.warn(`[public-register] No se pudo crear usuario para contacto ${ecEmail}:`, ecErr.message);
        }
      }

      contactsArray.push({
        ...(ecUserId ? { userId: ecUserId } : {}),
        firstName: ecFirstName,
        lastName: ecLastName,
        userEmail: ecEmail,
        phone: ec.phone || '',
        position: ec.position || '',
        isPracticeTutor: ec.isPracticeTutor === true || ec.isPracticeTutor === 'true',
        status: 'active'
      });
    }

    // Parsear domains
    let domains = [];
    if (req.body.domains) {
      try {
        domains = typeof req.body.domains === 'string'
          ? JSON.parse(req.body.domains)
          : req.body.domains;
      } catch { domains = []; }
    }
    if (!Array.isArray(domains)) domains = [];

    // Parsear legalRepresentative
    let legalRep = req.body.legalRepresentative || {};
    if (typeof legalRep === 'string') { try { legalRep = JSON.parse(legalRep); } catch { legalRep = {}; } }

    const newCompany = new Company({
      name: legalName,
      legalName,
      commercialName,
      idType,
      idNumber: nit,
      nit,
      sector: req.body.sector || '',
      sectorMineSnies: sectorMineSniesVal,
      size: req.body.size || '',
      arl: req.body.arl || '',
      ciiuCodes: ciiuCodes.slice(0, 3),
      address: req.body.address || req.body.direccion || '',
      city: req.body.city || '',
      country: req.body.country || 'Colombia',
      phone: repPhone,
      email: repEmail,
      website: req.body.website || '',
      domains: domains.filter(Boolean),
      description: req.body.description || '',
      chamberOfCommerceCertificate: '',
      rutDocument: '',
      contact: {
        name: `${repFirstName} ${repLastName}`.trim(),
        position: legalRep.position || '',
        phone: repPhone,
        email: repEmail
      },
      legalRepresentative: {
        firstName: repFirstName,
        lastName: repLastName,
        email: repEmail,
        idType: legalRep.idType || 'CC',
        idNumber: legalRep.idNumber || ''
      },
      contacts: contactsArray,
      status: 'pending_approval',
      canCreateOpportunities: false
    });

    await newCompany.save();

    // Archivos (logo + 3 documentos): solo después de crear la empresa en BD
    let uploadWarning = "";
    try {
      if (req.files && s3Config.isConfigured) {
        const uploaded = await uploadCompanyAssetsToS3(newCompany._id, req.files);
        if (Object.keys(uploaded).length > 0) {
          Object.assign(newCompany, uploaded);
          await newCompany.save();
        }
      } else if (req.files && Object.keys(req.files).length > 0 && !s3Config.isConfigured) {
        uploadWarning =
          " Los archivos adjuntos no se almacenaron (servidor sin S3). Podrá enviarlos cuando la coordinación lo solicite.";
      }
    } catch (upErr) {
      console.error("[public-register] Error subiendo archivos a S3:", upErr);
      uploadWarning =
        " La entidad quedó registrada, pero hubo un error al guardar uno o más archivos. La coordinación podrá solicitarlos de nuevo.";
    }

    await dispatchCompanyCreationNotifications({
      company: newCompany,
      userEmail: repEmail,
      password: nit,
      metadata: { companyId: String(newCompany._id), source: "publicRegisterCompany" },
    });

    return res.status(201).json({
      success: true,
      message:
        "Tu registro fue enviado exitosamente. La coordinación revisará y aprobará tu solicitud pronto." +
        uploadWarning,
      companyId: newCompany._id,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
