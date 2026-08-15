# Arquitectura

Destilado de `documento-maestro.html`. **Consulta este fichero, no el HTML.** Si algo no
está aquí y lo necesitas, búscalo en el HTML por su § y añade el resumen a este fichero.

## Topología

**Instancia dedicada por cliente**: un proyecto Supabase y un despliegue Vercel por
clínica, desde un repositorio único. No es multi-tenant — no existe `organizacion_id` en
las filas, porque cada instancia sirve a una sola organización. La tabla `organizacion`
tiene exactamente una fila.

Región **París** (`eu-west-3` / `cdg1`). En desarrollo, Supabase local con Docker.

## Dominios de datos

| Dominio | Tablas |
|---|---|
| Organización | `organizacion` (1 fila), `centros`, `perfiles`, `preferencias_usuario` |
| Paciente · identificativo | `pacientes`, `pacientes_identificacion`, `consentimientos` |
| Paciente · clínico | `episodios_asistenciales`, `diagnosticos`, `valoraciones_riesgo`, `notas_clinicas`, `notas_clinicas_versiones`, `evaluaciones`, `evaluacion_archivos`, `informes` |
| Agenda | `tipos_terapia`, `series_cita`, `citas`, `disponibilidad`, `alertas_documentacion` |
| Económico | `tarifas_paciente`, `series_facturacion`, `facturas`, `factura_lineas`, `cobros`, `bonos`, `gastos`, `registro_eventos_sif` |
| Firmas | `firmas_profesional`, `certificados_firma`, `firmas_paciente`, `consentimientos_firmados`, `documentos_firmados` |
| Mensajería | `canales_paciente`, `plantillas_mensaje`, `envios_mensaje`, `enlaces_respuesta`, `respuestas_mensaje` |
| Cumplimiento | `auditoria`, `accesos_historia`, `notificaciones`, `politicas_retencion`, `exportaciones` |

## Los cuatro invariantes

### 1 · Cadena de huellas

`huella(n) = SHA-256( contenido(n) || huella(n-1) )`

Un solo mecanismo sirve a dos obligaciones legales distintas:
`notas_clinicas_versiones` (Ley 41/2002) y `facturas` (RD 1007/2023 Verifactu).
Alterar un eslabón invalida todos los posteriores, y la verificación nocturna señala
cuál y cuándo.

### 2 · Solo adición

`notas_clinicas_versiones`, `facturas`, `auditoria` y `accesos_historia` **revocan
`UPDATE` y `DELETE` a todos los roles**, incluido el propietario. Corregir es añadir una
versión con motivo de cambio. Una factura no se edita: se anula y se reemite.

### 3 · Separación por sensibilidad

Lo que un rol no puede ver **no está en la tabla que sí puede leer**. Por eso
`pacientes` (ficha básica, la ven los tres roles) está separada de
`pacientes_identificacion` (DNI y domicilio) y de `episodios_asistenciales` (motivo de
consulta y diagnósticos). Así la política RLS del rol administrativo es trivial de
auditar y un `select *` olvidado no puede filtrar nada.

### 4 · La serie es la intención, la cita es el hecho

`series_cita` guarda la regla de repetición; al crearla se materializan las `citas` una
a una. Cada cita puede desviarse y queda marcada. **Las citas pasadas de una serie no se
modifican jamás**: tienen notas y cobros colgando.

## Roles

`administrador` · `profesional_sanitario` · `tecnico_administrativo`

| Recurso | Administrador | Profesional | Técnico administrativo |
|---|---|---|---|
| Ficha básica del paciente | Total | Sus pacientes | Subconjunto de lectura |
| DNI y domicilio | Total | Sus pacientes | Sin acceso |
| Motivo de consulta y diagnósticos | Solo los suyos | Sus pacientes | Sin acceso |
| Nivel de riesgo | Solo los suyos | Sus pacientes | Solo indicador binario |
| Notas clínicas | Solo las suyas (+ emergencia) | Autor o asignado | Sin acceso |
| Agenda | Todas | La suya | Todas, sin tipo de terapia |
| Facturación | Total | Lo suyo | Cobros, sin dato clínico |
| Usuarios y ajustes de empresa | Total | Sin acceso | Sin acceso |
| Auditoría | Lectura | Sus propios registros | Sin acceso |

**El secreto profesional es del profesional, no del cargo.** Ser administrador no da
acceso a notas ajenas: existe un **acceso de emergencia** que exige justificación
escrita, caduca solo, se audita de forma destacada y notifica al titular.

## RLS

Activo en **todas** las tablas desde la primera migración. Las políticas se apoyan en
funciones auxiliares para que se lean como frases:

- `rol_actual()` → rol del usuario autenticado
- `es_profesional_asignado(paciente_id)` → si el usuario actual atiende a ese paciente

**Cada política tiene su prueba automatizada.** Una política sin test se considera
código no escrito.

## Fiscalidad (afecta al modelo, no solo a la interfaz)

El tipo de IVA **se deriva del tipo de servicio**, no se elige a mano:

| Servicio | IVA | Fundamento |
|---|---|---|
| Terapia y evaluación diagnóstica | Exento | Art. 20.Uno.3.º LIVA |
| Informe pericial o para aseguradora | 21 % | Finalidad no asistencial |

Retención IRPF 15 %, o 7 % durante el año de inicio de actividad y los dos siguientes.
Precio = tarifa base del tipo de terapia, salvo `tarifas_paciente` vigente.

## Retención

El reloj arranca al **cerrar el episodio asistencial**, no al crear el registro.
25 años configurables, con mínimos legales bloqueados por debajo. Consentimientos e
informes de alta son de conservación indefinida. La purga anonimiza de forma
irreversible; no borra.
