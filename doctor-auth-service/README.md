# Auth Service (Doctores y Pacientes)

Microservicio de autenticación para proteger el acceso a OHIF con dos roles:

- **Doctor**: acceso completo a todos los estudios.
- **Paciente**: acceso limitado a estudios de su `PatientID`.

## Flujo

1. El usuario entra a `http://localhost:8042` (o `/ohif/`).
2. Si no está autenticado, se muestra el panel de login.
3. Con credenciales de **doctor**, el proxy permite todo el tráfico hacia OHIF + DICOMweb.
4. Con credenciales de **paciente**, el proxy:
   - filtra `GET /dicom-web/studies` para devolver solo estudios con su `PatientID`.
   - bloquea el acceso a `/dicom-web/studies/:StudyInstanceUID/...` si el estudio no pertenece al `PatientID` del paciente.

## Variables de entorno

- `PORT`: puerto del servicio (default: `3000`)
- `SESSION_SECRET`: secreto de sesión
- `DOCTOR_USER`: usuario de doctor
- `DOCTOR_PASS`: contraseña de doctor
- `PATIENT_USERS_JSON`: arreglo JSON de pacientes. Ejemplo:

```json
[
  { "username": "paciente1", "password": "123456", "patientId": "P001" },
  { "username": "paciente2", "password": "abc123", "patientId": "P002" }
]
```

Si `PATIENT_USERS_JSON` no se define, se usan:

- `PATIENT_USER` (default `patient`)
- `PATIENT_PASS` (default `patient123`)
- `PATIENT_ID` (default `PATIENT-001`)

Además:

- `OHIF_TARGET`: URL interna de OHIF (por defecto: `http://orthanc:8042/ohif`)
- `ORTHANC_TARGET`: URL base interna de Orthanc para DICOMweb (por defecto: `http://orthanc:8042`)
- `UPSTREAM_TIMEOUT_MS`: timeout máximo (en ms) para conexiones a OHIF/Orthanc (default: `15000`)

## Ejecutar local

```bash
npm install
npm start
```
