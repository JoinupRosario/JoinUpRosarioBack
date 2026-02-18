# Migración desde tenant-1.sql (MySQL) a MongoDB

## Orden recomendado de ejecución de seeders

1. Ubicaciones y datos maestros: countries, states, cities, items (listId).
2. Attachment: `node src/seeders/migrateAttachmentsFromMySQL.js`
3. Skill: `node src/seeders/migrateSkillsFromMySQL.js`
4. Program All: `node src/seeders/migrateProgramAllFromMySQL.js` (requiere items por type_practice_id).
5. Facultades y programas: migrateFacultiesAndProgramsFromMySQL.js (tabla program).
6. Postulantes y perfiles: migratePostulantsFromMySQL.js (depende de attachments y skills).

## Función de la tabla attachment (MySQL)

La tabla **attachment** es el **registro central de archivos adjuntos**. No guarda el archivo, sino los **metadatos**: id, name, content_type, filepath, status, downloaded, auditoría.

Otras tablas referencian attachment.id (FK) para asociar un archivo: profile_cv.attachment_id (CV), profile_supports.attachment_id (documentos soporte), postulant.photo_id (foto), empresas (logo, RUT, certificados), ofertas y prácticas (documentos requeridos, plantillas, etc.). Cualquier archivo del sistema tiene un registro en attachment; el resto solo guarda el id.
