import Company from "./company.model.js";
import Document from "../documents/document.model.js";
import User from "../users/user.model.js";
import bcrypt from "bcryptjs";
import { logHelper } from "../logs/log.service.js";

/** Validar NIT Colombia: 10 dígitos (9 base + 1 dígito de verificación), algoritmo módulo 11 DIAN */
function validarNitColombia(nit) {
  const str = String(nit || '').replace(/\D/g, '');
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
      
      // Contacto y ubicación
      address: req.body.address || '',
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
    const tipoNit = (req.body.idType || '').toUpperCase();
    if (tipoNit === 'NIT' && companyData.nit) {
      if (!/^\d{10}$/.test(String(companyData.nit).replace(/\s/g, ''))) {
        return res.status(400).json({
          success: false,
          message: 'El NIT debe tener exactamente 10 dígitos numéricos (9 dígitos base + 1 dígito de verificación).'
        });
      }
      const nitLimpio = String(companyData.nit).replace(/\D/g, '');
      if (!validarNitColombia(nitLimpio)) {
        return res.status(400).json({
          success: false,
          message: 'El dígito de verificación del NIT no es válido según el algoritmo de la DIAN (Colombia).'
        });
      }
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
    if (tipoNit === 'NIT' && nitUpdate) {
      const nitStr = String(nitUpdate).replace(/\D/g, '');
      if (nitStr.length !== 10) {
        return res.status(400).json({
          success: false,
          message: 'El NIT debe tener exactamente 10 dígitos numéricos (9 base + 1 dígito de verificación).'
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

    const company = await Company.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate("approvedBy", "name email");

    if (!company) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    // Si se cambió el estado, actualizar también el estado de todos los usuarios asociados (contactos)
    if (req.body.status !== undefined && empresaAnterior.contacts && empresaAnterior.contacts.length > 0) {
      const nuevoEstadoUsuario = company.status === 'active';
      // Actualizar estado de todos los usuarios de los contactos
      for (const contacto of empresaAnterior.contacts) {
        if (contacto.userId) {
          await User.findByIdAndUpdate(contacto.userId, { estado: nuevoEstadoUsuario });
        }
      }
      // También actualizar el estado de los contactos en el array
      company.contacts = company.contacts.map(contacto => ({
        ...contacto.toObject ? contacto.toObject() : contacto,
        status: nuevoEstadoUsuario ? 'active' : 'inactive'
      }));
      await company.save();
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

    const datosAnteriores = { ...contacto.toObject() };

    // Actualizar campos permitidos
    const camposPermitidos = [
      'firstName', 'lastName', 'alternateEmail', 'country', 'city', 'address',
      'phone', 'extension', 'mobile', 'idType', 'identification',
      'dependency', 'isPrincipal', 'position', 'isPracticeTutor', 'status'
    ];

    camposPermitidos.forEach(campo => {
      if (req.body[campo] !== undefined) {
        contacto[campo] = req.body[campo];
      }
    });

    // Si se marca como principal, quitar el flag de otros contactos
    if (req.body.isPrincipal && !datosAnteriores.isPrincipal) {
      company.contacts.forEach(c => {
        if (c._id.toString() !== contactId) {
          c.isPrincipal = false;
        }
      });
    }

    // Actualizar estado del usuario si cambió el status
    if (req.body.status !== undefined && contacto.userId) {
      const nuevoEstadoUsuario = req.body.status === 'active';
      await User.findByIdAndUpdate(contacto.userId, { estado: nuevoEstadoUsuario });
    }

    await company.save();

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'companies',
      `Contacto actualizado: ${company.commercialName || company.name} - ${contacto.firstName} ${contacto.lastName}`,
      company._id,
      datosAnteriores,
      { ...contacto.toObject() },
      { accion: 'actualizar_contacto' }
    );

    res.json({
      message: "Contacto actualizado correctamente",
      contact: contacto
    });
  } catch (error) {
    console.error('Error al actualizar contacto:', error);
    res.status(500).json({ message: error.message });
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

    // Generar nueva contraseña (usar identificación o generar una aleatoria)
    const nuevaPassword = contacto.identification && contacto.identification.length >= 6
      ? contacto.identification
      : Math.random().toString(36).slice(-8);

    // Actualizar contraseña del usuario
    await User.findByIdAndUpdate(contacto.userId, {
      password: await bcrypt.hash(nuevaPassword, 10)
    });

    // Registrar log
    await logHelper.crear(
      req,
      'UPDATE',
      'companies',
      `Contraseña reseteada para contacto: ${company.commercialName || company.name} - ${contacto.firstName} ${contacto.lastName}`,
      company._id,
      null,
      { accion: 'resetear_contraseña_contacto', contactoId: contactId },
      { accion: 'resetear_contraseña_contacto' }
    );

    res.json({ 
      message: "Contraseña reseteada correctamente",
      // En producción, no deberías enviar la contraseña. Esto es solo para desarrollo
      password: nuevaPassword
    });
  } catch (error) {
    console.error('Error al resetear contraseña:', error);
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
