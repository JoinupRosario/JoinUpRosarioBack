// src/modules/permisos/seedPermisos.js
import mongoose from 'mongoose';
import Permiso from './permiso.model.js'; // ajusta la ruta si es necesario
import dotenv from 'dotenv';
dotenv.config();

const permisosIniciales = [
  // ========== MÓDULO EMPRESA (1-13) ==========
  { codigo: 'AAME', nombre: 'Acceso al módulo Empresa', modulo: 'EMPRESA' },
  { codigo: 'LEMP', nombre: 'Listar empresas', modulo: 'EMPRESA' },
  { codigo: 'CEMP', nombre: 'Crear empresas', modulo: 'EMPRESA' },
  { codigo: 'EEMP', nombre: 'Editar empresas', modulo: 'EMPRESA' },
  { codigo: 'CEEE', nombre: 'Cambiar estado a empresas', modulo: 'EMPRESA' },
  { codigo: 'AIEO', nombre: 'Activar/Inactivar empresas para la creación de ofertas', modulo: 'EMPRESA' },
  { codigo: 'LCCE', nombre: 'Listar cambios de estado de empresa', modulo: 'EMPRESA' },
  { codigo: 'CCON', nombre: 'Crear contactos de empresas', modulo: 'EMPRESA' },
  { codigo: 'ECON', nombre: 'Editar contactos de empresas', modulo: 'EMPRESA' },
  { codigo: 'CCEC', nombre: 'Cambiar estado a contactos de empresa', modulo: 'EMPRESA' },
  { codigo: 'LCON', nombre: 'Listar contactos de empresa', modulo: 'EMPRESA' },
  { codigo: 'LDOC', nombre: 'Listar documentos de empresa', modulo: 'EMPRESA' },
  { codigo: 'MDOC', nombre: 'Modificar documentos de empresa', modulo: 'EMPRESA' },

  // ========== MÓDULO POSTULANTES (14-26) ==========
  { codigo: 'AMPO', nombre: 'Acceso al módulo Postulantes', modulo: 'POSTULANTES' },
  { codigo: 'CPOS', nombre: 'Cargar postulantes', modulo: 'POSTULANTES' },
  { codigo: 'EMIP', nombre: 'Editar mi perfil', modulo: 'POSTULANTES' },
  { codigo: 'EPOS', nombre: 'Editar postulantes', modulo: 'POSTULANTES' },
  { codigo: 'CEPO', nombre: 'Cambiar estado de postulante', modulo: 'POSTULANTES' },
  { codigo: 'ELPO', nombre: 'Eliminar un postulante', modulo: 'POSTULANTES' },
  { codigo: 'CAUM', nombre: 'Consulta de autorizados monitorías, tutorías y mentorías', modulo: 'POSTULANTES' },
  { codigo: 'LBPO', nombre: 'Listar/Buscar postulante', modulo: 'POSTULANTES' },
  { codigo: 'VPPO', nombre: 'Ver perfil postulante', modulo: 'POSTULANTES' },
  { codigo: 'EFEN', nombre: 'Puede editar la fecha de nacimiento de un postulante', modulo: 'POSTULANTES' },
  { codigo: 'EIDE', nombre: 'Puede editar la identificación del postulante', modulo: 'POSTULANTES' },
  { codigo: 'ADPS', nombre: 'Puede actualizar datos del postulante desde el Sistema Académico', modulo: 'POSTULANTES' },
  { codigo: 'ADAP', nombre: 'Puede actualizar datos académicos del postulante desde el Sistema Académico', modulo: 'POSTULANTES' },

  // ========== MÓDULO OPORTUNIDADES (27-54) ==========
  { codigo: 'AMOP', nombre: 'Acceso módulo Oportunidades', modulo: 'OPORTUNIDADES' },
  { codigo: 'COGE', nombre: 'Consultar oportunidades genéricas', modulo: 'OPORTUNIDADES' },
  { codigo: 'COMT', nombre: 'Crear oportunidades tipo monitorías, tutorías y mentorías', modulo: 'OPORTUNIDADES' },
  { codigo: 'CPRA', nombre: 'Crear prácticas académicas', modulo: 'OPORTUNIDADES' },
  { codigo: 'COMT2', nombre: 'Consulta oportunidades tipo monitorías, tutorías y mentorías', modulo: 'OPORTUNIDADES' },
  { codigo: 'COMN', nombre: 'Consulta oportunidades tipo monitorías, tutorías y mentorías no propias', modulo: 'OPORTUNIDADES' },
  { codigo: 'CPAC', nombre: 'Consulta prácticas académicas', modulo: 'OPORTUNIDADES' },
  { codigo: 'AOMT', nombre: 'Actualiza oportunidades tipo monitorías, tutorías y mentorías', modulo: 'OPORTUNIDADES' },
  { codigo: 'APRA', nombre: 'Actualiza prácticas académicas', modulo: 'OPORTUNIDADES' },
  { codigo: 'AOMA', nombre: 'Actualizar oportunidades de monitorías, tutorías y mentorías activas', modulo: 'OPORTUNIDADES' },
  { codigo: 'AOPA', nombre: 'Actualizar oportunidades de prácticas académicas activas', modulo: 'OPORTUNIDADES' },
  { codigo: 'APOP', nombre: 'Actualizar programas de oportunidades de prácticas académicas activas', modulo: 'OPORTUNIDADES' },
  { codigo: 'VISI', nombre: 'Ver información salarial de la oportunidad prácticas académicas', modulo: 'OPORTUNIDADES' },
  { codigo: 'VRCS', nombre: 'Vizualizar campo de requerir confidencialidad para el salario prácticas', modulo: 'OPORTUNIDADES' },
  { codigo: 'CEOM', nombre: 'Cambiar estado a oportunidades tipo monitorías, tutorías y mentorías', modulo: 'OPORTUNIDADES' },
  { codigo: 'CEPR', nombre: 'Cambiar estado a prácticas académicas', modulo: 'OPORTUNIDADES' },
  { codigo: 'CPPA', nombre: 'Consultar programas pendientes por aprobación en una práctica académica', modulo: 'OPORTUNIDADES' },
  { codigo: 'APPA', nombre: 'Aprobar programa de una práctica académica', modulo: 'OPORTUNIDADES' },
  { codigo: 'CCEP', nombre: 'Consultar cambios de estado de los programas de una práctica académica', modulo: 'OPORTUNIDADES' },
  { codigo: 'DOPO', nombre: 'Duplicar oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'CAOP', nombre: 'Crear aplicación a oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'AAOP', nombre: 'Actualizar aplicación a oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'LAOP', nombre: 'Listar/Buscar aplicación a oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'EAOP', nombre: 'Eliminar aplicación a oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'VAOP', nombre: 'Ver aplicación a oportunidad', modulo: 'OPORTUNIDADES' },
  { codigo: 'MARE', nombre: 'Marcar una aplicación como revisada', modulo: 'OPORTUNIDADES' },
  { codigo: 'MADE', nombre: 'Marcar una aplicación como descargada', modulo: 'OPORTUNIDADES' },
  { codigo: 'ABRA', nombre: 'Activar botones de revisión de aplicaciones', modulo: 'OPORTUNIDADES' },

  // ========== MÓDULO PRÁCTICAS (55-110) ==========
  { codigo: 'AMPR', nombre: 'Acceso al módulo de prácticas', modulo: 'PRACTICAS' },
  { codigo: 'CEST', nombre: 'Cargar estudiantes para práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'BEST', nombre: 'Borrar estudiantes para práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'BUSP', nombre: 'Buscar estudiantes para práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'DREP', nombre: 'Descargar reporte estudiantes para práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'VHCE', nombre: 'Ver historial de cambios de estado de estudiantes para práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CDDP', nombre: 'Consultar la definición de documentos para practicas academicas', modulo: 'PRACTICAS' },
  { codigo: 'CRDD', nombre: 'Crear definición de documentos para practicas academicas', modulo: 'PRACTICAS' },
  { codigo: 'ACDD', nombre: 'Actualizar definición de documentos para practicas academicas', modulo: 'PRACTICAS' },
  { codigo: 'ACAF', nombre: 'Actualizar carta de funciones', modulo: 'PRACTICAS' },
  { codigo: 'ELDD', nombre: 'Eliminar definición de documentos para practicas academicas', modulo: 'PRACTICAS' },
  { codigo: 'CLPA', nombre: 'Consultar legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'IGPA', nombre: 'Generar informe general de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CRLP', nombre: 'Crear legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'RMLP', nombre: 'Puede realizar monitorías de legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'RTJL', nombre: 'Puede realizar tutorías(jefe) de legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACLP', nombre: 'Actualizar legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACLE', nombre: 'Actualizar legalización en cualquier estado antes de finalizada', modulo: 'PRACTICAS' },
  { codigo: 'ACVP', nombre: 'Actualizar legalización - Vista postulante (Prácticas)', modulo: 'PRACTICAS' },
  { codigo: 'APLE', nombre: 'Aprobación de Legalizaciones', modulo: 'PRACTICAS' },
  { codigo: 'ANLE', nombre: 'Anulación de Legalizaciones', modulo: 'PRACTICAS' },
  { codigo: 'ELLP', nombre: 'Eliminar legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'VTLP', nombre: 'Ver todas las legalizaciones de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'LCEL', nombre: 'Listar el cambio de estado de las legalizaciones', modulo: 'PRACTICAS' },
  { codigo: 'CDRL', nombre: 'Consultar documentos requeridos para legalización de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CCDR', nombre: 'Crear documentos requeridos para legalización de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACDR', nombre: 'Actualizar documentos requeridos para legalización de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ELDR', nombre: 'Eliminar documentos requeridos para legalización de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'VADP', nombre: 'Visualizar aprobación de documentos de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'APDP', nombre: 'Aprobar documentos de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACADP', nombre: 'Actualizar aprobaciones de documentos de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ELAP', nombre: 'Eliminar aprobacion de documentos de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CADP', nombre: 'Consultar actividades definidas para seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CRDA', nombre: 'Crear definición de actividad para seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACDA', nombre: 'Actualizar definición de actividad para seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ELAD', nombre: 'Eliminar actividad definida para seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'VMPP', nombre: 'Visualizar módulo de la Plan de práctica', modulo: 'PRACTICAS' },
  { codigo: 'CREP', nombre: 'Crear elementos del plan de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACPP', nombre: 'Actualizar plan de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'APPP', nombre: 'Aprobar plan de práctica', modulo: 'PRACTICAS' },
  { codigo: 'RPPP', nombre: 'Rechazar plan de práctica', modulo: 'PRACTICAS' },
  { codigo: 'ELPP', nombre: 'Eliminar plan de práctica', modulo: 'PRACTICAS' },
  { codigo: 'DSOL', nombre: 'Definir seguimiento sobre una legalización', modulo: 'PRACTICAS' },
  { codigo: 'CRSP', nombre: 'Crear seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'ACSP', nombre: 'Actualizar seguimiento de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'APAS', nombre: 'Aprobar una actividad de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'APCS', nombre: 'Aprobar/Cerrar una actividad de seguimiento nivel superior', modulo: 'PRACTICAS' },
  { codigo: 'REAS', nombre: 'Rechazar una actividad de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'CISP', nombre: 'Cargar informe final de seguimiento de práctica académica (Finalizar)', modulo: 'PRACTICAS' },
  { codigo: 'CSLP', nombre: 'Consultar seguimiento de una legalización de práctica académica', modulo: 'PRACTICAS' },
  { codigo: 'CCEP2', nombre: 'Cargar certificación de Prácticas y Pasantías (Empresa)', modulo: 'PRACTICAS' },
  { codigo: 'COES', nombre: 'Consultar evaluaciones de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'CRES', nombre: 'Crear una evaluación de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'ACES', nombre: 'Actualizar una evaluación de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'CEES', nombre: 'Cambiar el estado de una evaluación de seguimiento', modulo: 'PRACTICAS' },
  { codigo: 'CREE', nombre: 'Consultar respuestas de evaluaciones de una legalización', modulo: 'PRACTICAS' },

  // ========== MÓDULO MONITORÍAS (111-154) ==========
  { codigo: 'CDDM', nombre: 'Consultar la definición de documentos para monitorías', modulo: 'MONITORIAS' },
  { codigo: 'CRDM', nombre: 'Crear definición de documentos para monitorías', modulo: 'MONITORIAS' },
  { codigo: 'ACDM', nombre: 'Actualizar definición de documentos para monitorías', modulo: 'MONITORIAS' },
  { codigo: 'ELDM', nombre: 'Eliminar definición de documentos para monitorías', modulo: 'MONITORIAS' },
  { codigo: 'CLMO', nombre: 'Consultar legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CRLM', nombre: 'Crear legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'PCLM', nombre: 'Puede coordinar legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACLM', nombre: 'Actualizar legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACME', nombre: 'Actualizar legalización de monitoría en cualquier estado antes de finalizada', modulo: 'MONITORIAS' },
  { codigo: 'ACVM', nombre: 'Actualizar legalización - Vista postulante (Monitorías)', modulo: 'MONITORIAS' },
  { codigo: 'APLM', nombre: 'Aprobación de Legalizaciones (Monitorías)', modulo: 'MONITORIAS' },
  { codigo: 'ANLM', nombre: 'Anulación de Legalizaciones (Monitorías)', modulo: 'MONITORIAS' },
  { codigo: 'ELLM', nombre: 'Eliminar legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ADLM', nombre: 'Administrar legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'LCEM', nombre: 'Listar el cambio de estado de las legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'LLMO', nombre: 'Listar las legalizaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CDRM', nombre: 'Consultar documentos requeridos para legalización de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CCDRM', nombre: 'Crear documentos requeridos para legalización de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACDRM', nombre: 'Actualizar documentos requeridos para legalización de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ELDRM', nombre: 'Eliminar documentos requeridos para legalización de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'VADM', nombre: 'Visualizar aprobación de documentos de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'APDM', nombre: 'Aprobar documentos de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACAM', nombre: 'Actualizar aprobaciones de documentos de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ELAM', nombre: 'Eliminar aprobacion de documentos de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'VMPM', nombre: 'Visualizar módulo de la Plan de trabajo de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CREM', nombre: 'Crear elementos del plan de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACPM', nombre: 'Actualizar plan de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'APPM', nombre: 'Aprobar plan de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'RPPM', nombre: 'Rechazar plan de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ELPM', nombre: 'Eliminar plan de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'DRPM', nombre: 'Descargar reporte de plan de trabajo monitorías', modulo: 'MONITORIAS' },
  { codigo: 'DSML', nombre: 'Definir seguimiento sobre una legalización (Monitorías)', modulo: 'MONITORIAS' },
  { codigo: 'CRSM', nombre: 'Crear seguimiento de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACSM', nombre: 'Actualizar seguimiento de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'APAM', nombre: 'Aprobar una actividad de seguimiento de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'DRAM', nombre: 'Descargar reporte de asistencia de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'APCM', nombre: 'Aprobar/Cerrar una actividad de seguimiento de monitoría nivel superior', modulo: 'MONITORIAS' },
  { codigo: 'REASM', nombre: 'Rechazar una actividad de seguimiento (Monitorías)', modulo: 'MONITORIAS' },
  { codigo: 'CISM', nombre: 'Cargar informe final de seguimiento de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CSLM', nombre: 'Consultar seguimiento de una legalización de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'COEM', nombre: 'Consultar evaluaciones de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CREM_EVAL', nombre: 'Crear una evaluación de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'ACEM', nombre: 'Actualizar una evaluación de monitoría', modulo: 'MONITORIAS' },
  { codigo: 'CEEM', nombre: 'Cambiar el estado de una evaluación de monitoría', modulo: 'MONITORIAS' },

  // ========== MÓDULO REPORTES (155-159) ==========
  { codigo: 'AMRE', nombre: 'Acceso al Módulo de Reportes', modulo: 'REPORTES' },
  { codigo: 'GPAG', nombre: 'Gestor de páginas', modulo: 'REPORTES' },
  { codigo: 'CPAG', nombre: 'Crear páginas', modulo: 'REPORTES' },
  { codigo: 'APAG', nombre: 'Actualizar páginas', modulo: 'REPORTES' },
  { codigo: 'EPAG', nombre: 'Eliminar páginas', modulo: 'REPORTES' },

  // ========== MÓDULO SUCURSALES (160-164) ==========
  { codigo: 'AMSU', nombre: 'Acceso al módulo de sucursales', modulo: 'SUCURSALES' },
  { codigo: 'CTSU', nombre: 'Consulta todas las sucursales', modulo: 'SUCURSALES' },
  { codigo: 'CCSU', nombre: 'Crea una sucursal', modulo: 'SUCURSALES' },
  { codigo: 'EDSU', nombre: 'Edita una sucursal', modulo: 'SUCURSALES' },
  { codigo: 'ELSU', nombre: 'Elimina una sucursal', modulo: 'SUCURSALES' },

  // ========== MÓDULO ROLES (165) ==========
  { codigo: 'AMRO', nombre: 'Acceso al módulo Roles', modulo: 'ROLES' },

  // ========== MÓDULO USUARIOS (166-173) ==========
  { codigo: 'AMUS', nombre: 'Acceso al modulo Usuarios', modulo: 'USUARIOS' },
  { codigo: 'LUSU', nombre: 'Listar Usuarios', modulo: 'USUARIOS' },
  { codigo: 'CUSU', nombre: 'Crear usuarios', modulo: 'USUARIOS' },
  { codigo: 'EDUS', nombre: 'Editar usuarios', modulo: 'USUARIOS' },
  { codigo: 'CEUS', nombre: 'Cambiar estado a usuarios', modulo: 'USUARIOS' },
  { codigo: 'ARUS', nombre: 'Asociar roles a usuarios', modulo: 'USUARIOS' },
  { codigo: 'VUSU', nombre: 'Ver usuarios', modulo: 'USUARIOS' },
  { codigo: 'CEUS2', nombre: 'Cambiar estado de usuario', modulo: 'USUARIOS' },

  // ========== MÓDULO CONFIGURACIÓN (174-184) ==========
  { codigo: 'AMCO', nombre: 'Módulo Configuración', modulo: 'CONFIGURACION' },
  { codigo: 'CFPP', nombre: 'Configuración de facultades y programas', modulo: 'CONFIGURACION' },
  { codigo: 'CFAL', nombre: 'Configuración de alertas', modulo: 'CONFIGURACION' },
  { codigo: 'CFOP', nombre: 'Configuración de oportunidades para postulante', modulo: 'CONFIGURACION' },
  { codigo: 'CFOA', nombre: 'Configuración de oportunidades para administradores', modulo: 'CONFIGURACION' },
  { codigo: 'CFCC', nombre: 'Configuración de condiciones curriculares', modulo: 'CONFIGURACION' },
  { codigo: 'CFNG', nombre: 'Configuración de notificaciones generales', modulo: 'CONFIGURACION' },
  { codigo: 'CFNM', nombre: 'Configuración de notificaciones de monitorías', modulo: 'CONFIGURACION' },
  { codigo: 'CFNP', nombre: 'Configuración de notificaciones de práctica', modulo: 'CONFIGURACION' },
  { codigo: 'CFDL', nombre: 'Configuración de documentos de legalización', modulo: 'CONFIGURACION' },
  { codigo: 'CFAS', nombre: 'Configuración de actividades de seguimiento de práctica', modulo: 'CONFIGURACION' },

  // ========== MÓDULO GESTIÓN DE PERIODOS (185-190) ==========
  { codigo: 'AMGP', nombre: 'Acceso al módulo de Gestión de Periodos', modulo: 'PERIODOS' },
  { codigo: 'LPER', nombre: 'Listar períodos', modulo: 'PERIODOS' },
  { codigo: 'CPER', nombre: 'Crear período', modulo: 'PERIODOS' },
  { codigo: 'EPER', nombre: 'Editar período', modulo: 'PERIODOS' },
  { codigo: 'EPMO', nombre: 'Editar período de monitoría', modulo: 'PERIODOS' },
  { codigo: 'CEPE', nombre: 'Cambiar estado de períodos', modulo: 'PERIODOS' },

  // ========== MÓDULO GESTIÓN DE ESTADOS (191-195) ==========
  { codigo: 'AMGE', nombre: 'Acceso al módulo de Gestión de Estados de Práctica', modulo: 'ESTADOS_PRACTICA' },
  { codigo: 'LEST', nombre: 'Listar estados', modulo: 'ESTADOS_PRACTICA' },
  { codigo: 'CRES', nombre: 'Crear estado', modulo: 'ESTADOS_PRACTICA' },
  { codigo: 'EDES', nombre: 'Editar estado', modulo: 'ESTADOS_PRACTICA' },
  { codigo: 'CAIE', nombre: 'Cambiar activar/inactivar estados', modulo: 'ESTADOS_PRACTICA' },

  // ========== MÓDULO ADJUNTOS (196-200) ==========
  { codigo: 'AMAD', nombre: 'Acceso al módulo Adjuntos', modulo: 'ADJUNTOS' },
  { codigo: 'CRAD', nombre: 'Crear adjunto', modulo: 'ADJUNTOS' },
  { codigo: 'ACAD', nombre: 'Actualizar adjunto', modulo: 'ADJUNTOS' },
  { codigo: 'LBAD', nombre: 'Listar/Buscar adjunto', modulo: 'ADJUNTOS' },
  { codigo: 'ELAD', nombre: 'Eliminar adjunto', modulo: 'ADJUNTOS' },
  { codigo: 'VADJ', nombre: 'Ver adjunto', modulo: 'ADJUNTOS' },

  // ========== MÓDULO FORMULARIOS (201-205) ==========
  { codigo: 'AMFO', nombre: 'Edición de Campos en los Formularios', modulo: 'FORMULARIOS' },
  { codigo: 'EDNI', nombre: 'Editar el campo NIT en el formulario de Empresa', modulo: 'FORMULARIOS' },
  { codigo: 'EDUS2', nombre: 'Editar el campo UserName en el formulario de Empresa', modulo: 'FORMULARIOS' },
  { codigo: 'EDRS', nombre: 'Editar el campo Razón Social en el formulario de Empresa', modulo: 'FORMULARIOS' },
  { codigo: 'EDUN', nombre: 'Editar el username de un usuario', modulo: 'FORMULARIOS' },

  // ========== MÓDULO LISTAS SISTEMA (206-209) ==========
  { codigo: 'AMLS', nombre: 'Consultar las listas del sistema', modulo: 'LISTAS_SISTEMA' },
  { codigo: 'CRLV', nombre: 'Crear una lista de valores', modulo: 'LISTAS_SISTEMA' },
  { codigo: 'ACLV', nombre: 'Actualizar una lista de valores', modulo: 'LISTAS_SISTEMA' },
  { codigo: 'COLV', nombre: 'Consultar listas de valores', modulo: 'LISTAS_SISTEMA' }
];

const seedPermisos = async () => {
  const MONGO_URI = process.env.MONGO_URI;
  if (!MONGO_URI) {
    console.error('❌ Error: define MONGO_URI en tu .env antes de ejecutar este script.');
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI, {
      // opciones compatibles: timeout por ejemplo
      connectTimeoutMS: 10000
    });
    console.log('🔗 Conectado a MongoDB...');

    // Preparamos operaciones bulk (upsert por codigo)
    const bulkOps = permisosIniciales.map(p => ({
      updateOne: {
        filter: { codigo: p.codigo },
        update: { $set: p },
        upsert: true
      }
    }));

    const result = await Permiso.bulkWrite(bulkOps, { ordered: false });
    console.log('📝 Operación bulkWrite completada.');
    console.log(`Inserted: ${result.nUpserted || 0}, Modified: ${result.nModified || 0}, Matched: ${result.nMatched || 0}`);

    // Reporte por módulo (opcional, más amigable)
    const resumen = {};
    permisosIniciales.forEach(p => { resumen[p.modulo] = (resumen[p.modulo] || 0) + 1; });
    console.log('\n📊 Resumen por módulo:');
    Object.entries(resumen).forEach(([modulo, count]) => console.log(` - ${modulo}: ${count}`));

    console.log('\n🎉 Seed ejecutado correctamente. Total permisos procesados:', permisosIniciales.length);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error en seed de permisos:', err);
    await mongoose.disconnect().catch(()=>{});
    process.exit(1);
  }
};

seedPermisos();
