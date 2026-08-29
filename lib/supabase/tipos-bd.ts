export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accesos_historia: {
        Row: {
          agente: string | null
          desbloqueo_id: string | null
          id: number
          iniciado_en: string
          ip: unknown
          justificacion: string | null
          paciente_id: string
          perfil_id: string
          pestana: Database["public"]["Enums"]["pestana_historia"] | null
          tipo: Database["public"]["Enums"]["tipo_acceso_historia"]
        }
        Insert: {
          agente?: string | null
          desbloqueo_id?: string | null
          id?: never
          iniciado_en?: string
          ip?: unknown
          justificacion?: string | null
          paciente_id: string
          perfil_id: string
          pestana?: Database["public"]["Enums"]["pestana_historia"] | null
          tipo: Database["public"]["Enums"]["tipo_acceso_historia"]
        }
        Update: {
          agente?: string | null
          desbloqueo_id?: string | null
          id?: never
          iniciado_en?: string
          ip?: unknown
          justificacion?: string | null
          paciente_id?: string
          perfil_id?: string
          pestana?: Database["public"]["Enums"]["pestana_historia"] | null
          tipo?: Database["public"]["Enums"]["tipo_acceso_historia"]
        }
        Relationships: [
          {
            foreignKeyName: "accesos_historia_desbloqueo_id_fkey"
            columns: ["desbloqueo_id"]
            isOneToOne: false
            referencedRelation: "desbloqueos_historia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      accesos_historia_vistas: {
        Row: {
          acceso_id: number
          id: number
          ocurrido_en: string
        }
        Insert: {
          acceso_id: number
          id?: never
          ocurrido_en?: string
        }
        Update: {
          acceso_id?: number
          id?: never
          ocurrido_en?: string
        }
        Relationships: []
      }
      alertas_documentacion: {
        Row: {
          centro_id: string | null
          creada_en: string
          estado: string
          fecha_referencia: string | null
          id: string
          origen_id: string
          origen_tabla: string
          paciente_id: string
          profesional_id: string | null
          resuelta_en: string | null
          tipo: Database["public"]["Enums"]["tipo_alerta_documentacion"]
        }
        Insert: {
          centro_id?: string | null
          creada_en?: string
          estado?: string
          fecha_referencia?: string | null
          id?: string
          origen_id: string
          origen_tabla: string
          paciente_id: string
          profesional_id?: string | null
          resuelta_en?: string | null
          tipo: Database["public"]["Enums"]["tipo_alerta_documentacion"]
        }
        Update: {
          centro_id?: string | null
          creada_en?: string
          estado?: string
          fecha_referencia?: string | null
          id?: string
          origen_id?: string
          origen_tabla?: string
          paciente_id?: string
          profesional_id?: string | null
          resuelta_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_alerta_documentacion"]
        }
        Relationships: [
          {
            foreignKeyName: "alertas_documentacion_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_documentacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_documentacion_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_documentacion_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria: {
        Row: {
          actor_id: string | null
          estado_anterior: Json | null
          estado_posterior: Json | null
          id: number
          ocurrido_en: string
          operacion: string
          registro_id: string
          tabla: string
        }
        Insert: {
          actor_id?: string | null
          estado_anterior?: Json | null
          estado_posterior?: Json | null
          id?: never
          ocurrido_en?: string
          operacion: string
          registro_id: string
          tabla: string
        }
        Update: {
          actor_id?: string | null
          estado_anterior?: Json | null
          estado_posterior?: Json | null
          id?: never
          ocurrido_en?: string
          operacion?: string
          registro_id?: string
          tabla?: string
        }
        Relationships: []
      }
      centros: {
        Row: {
          activo: boolean
          codigo_postal: string | null
          creado_en: string
          direccion: string | null
          id: string
          localidad: string | null
          nombre: string
          provincia: string | null
          telefono: string | null
          zona_horaria: string | null
        }
        Insert: {
          activo?: boolean
          codigo_postal?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          localidad?: string | null
          nombre: string
          provincia?: string | null
          telefono?: string | null
          zona_horaria?: string | null
        }
        Update: {
          activo?: boolean
          codigo_postal?: string | null
          creado_en?: string
          direccion?: string | null
          id?: string
          localidad?: string | null
          nombre?: string
          provincia?: string | null
          telefono?: string | null
          zona_horaria?: string | null
        }
        Relationships: []
      }
      consentimiento_firmantes: {
        Row: {
          consentimiento_id: string
          creado_en: string
          documento_justificativo_ruta: string | null
          firmado_en: string | null
          id: string
          nombre_completo: string
          paciente_id: string | null
          representante_id: string | null
        }
        Insert: {
          consentimiento_id: string
          creado_en?: string
          documento_justificativo_ruta?: string | null
          firmado_en?: string | null
          id?: string
          nombre_completo: string
          paciente_id?: string | null
          representante_id?: string | null
        }
        Update: {
          consentimiento_id?: string
          creado_en?: string
          documento_justificativo_ruta?: string | null
          firmado_en?: string | null
          id?: string
          nombre_completo?: string
          paciente_id?: string | null
          representante_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consentimiento_firmantes_consentimiento_id_fkey"
            columns: ["consentimiento_id"]
            isOneToOne: false
            referencedRelation: "consentimientos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimiento_firmantes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimiento_firmantes_representante_id_fkey"
            columns: ["representante_id"]
            isOneToOne: false
            referencedRelation: "representantes_paciente"
            referencedColumns: ["id"]
          },
        ]
      }
      consentimientos: {
        Row: {
          creado_en: string
          creado_por: string | null
          documento_ruta: string | null
          episodio_id: string | null
          id: string
          menor_oido_en: string | null
          otorgado_en: string | null
          paciente_id: string
          revocado_en: string | null
          texto_firmado: string | null
          texto_version: string | null
          tipo: Database["public"]["Enums"]["tipo_consentimiento"]
        }
        Insert: {
          creado_en?: string
          creado_por?: string | null
          documento_ruta?: string | null
          episodio_id?: string | null
          id?: string
          menor_oido_en?: string | null
          otorgado_en?: string | null
          paciente_id: string
          revocado_en?: string | null
          texto_firmado?: string | null
          texto_version?: string | null
          tipo: Database["public"]["Enums"]["tipo_consentimiento"]
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          documento_ruta?: string | null
          episodio_id?: string | null
          id?: string
          menor_oido_en?: string | null
          otorgado_en?: string | null
          paciente_id?: string
          revocado_en?: string | null
          texto_firmado?: string | null
          texto_version?: string | null
          tipo?: Database["public"]["Enums"]["tipo_consentimiento"]
        }
        Relationships: [
          {
            foreignKeyName: "consentimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_episodio_fk"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consentimientos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      desbloqueos_historia: {
        Row: {
          caduca_en: string
          concedido_en: string
          id: string
          perfil_id: string
          revocado_en: string | null
        }
        Insert: {
          caduca_en: string
          concedido_en?: string
          id?: string
          perfil_id: string
          revocado_en?: string | null
        }
        Update: {
          caduca_en?: string
          concedido_en?: string
          id?: string
          perfil_id?: string
          revocado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "desbloqueos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desbloqueos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnosticos: {
        Row: {
          cie10es_codigo: string
          cie10es_descripcion: string | null
          diagnosticado_en: string
          diagnosticado_por: string | null
          dsm5tr_codigo: string | null
          dsm5tr_descripcion: string | null
          episodio_id: string
          id: string
          paciente_id: string
          principal: boolean
          retirado_en: string | null
        }
        Insert: {
          cie10es_codigo: string
          cie10es_descripcion?: string | null
          diagnosticado_en?: string
          diagnosticado_por?: string | null
          dsm5tr_codigo?: string | null
          dsm5tr_descripcion?: string | null
          episodio_id: string
          id?: string
          paciente_id: string
          principal?: boolean
          retirado_en?: string | null
        }
        Update: {
          cie10es_codigo?: string
          cie10es_descripcion?: string | null
          diagnosticado_en?: string
          diagnosticado_por?: string | null
          dsm5tr_codigo?: string | null
          dsm5tr_descripcion?: string | null
          episodio_id?: string
          id?: string
          paciente_id?: string
          principal?: boolean
          retirado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnosticos_diagnosticado_por_fkey"
            columns: ["diagnosticado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosticos_diagnosticado_por_fkey"
            columns: ["diagnosticado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosticos_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diagnosticos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      episodio_participantes: {
        Row: {
          alta_en: string
          baja_en: string | null
          episodio_id: string
          id: string
          paciente_id: string
          papel: string
        }
        Insert: {
          alta_en?: string
          baja_en?: string | null
          episodio_id: string
          id?: string
          paciente_id: string
          papel: string
        }
        Update: {
          alta_en?: string
          baja_en?: string | null
          episodio_id?: string
          id?: string
          paciente_id?: string
          papel?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodio_participantes_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodio_participantes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      episodios_asistenciales: {
        Row: {
          abierto_en: string
          centro_id: string | null
          cerrado_en: string | null
          creado_en: string
          id: string
          modalidad_relacional: Database["public"]["Enums"]["modalidad_relacional"]
          motivo_cierre: string | null
          motivo_consulta: string | null
          paciente_id: string
          profesional_id: string
        }
        Insert: {
          abierto_en?: string
          centro_id?: string | null
          cerrado_en?: string | null
          creado_en?: string
          id?: string
          modalidad_relacional?: Database["public"]["Enums"]["modalidad_relacional"]
          motivo_cierre?: string | null
          motivo_consulta?: string | null
          paciente_id: string
          profesional_id: string
        }
        Update: {
          abierto_en?: string
          centro_id?: string | null
          cerrado_en?: string | null
          creado_en?: string
          id?: string
          modalidad_relacional?: Database["public"]["Enums"]["modalidad_relacional"]
          motivo_cierre?: string | null
          motivo_consulta?: string | null
          paciente_id?: string
          profesional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "episodios_asistenciales_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_asistenciales_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_asistenciales_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodios_asistenciales_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluacion_archivos: {
        Row: {
          evaluacion_id: string
          id: string
          mime: string
          nombre_original: string
          ruta: string
          subido_en: string
          subido_por: string | null
          tamano_bytes: number
        }
        Insert: {
          evaluacion_id: string
          id?: string
          mime: string
          nombre_original: string
          ruta: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes: number
        }
        Update: {
          evaluacion_id?: string
          id?: string
          mime?: string
          nombre_original?: string
          ruta?: string
          subido_en?: string
          subido_por?: string | null
          tamano_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluacion_archivos_evaluacion_id_fkey"
            columns: ["evaluacion_id"]
            isOneToOne: false
            referencedRelation: "evaluaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluacion_archivos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluacion_archivos_subido_por_fkey"
            columns: ["subido_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluaciones: {
        Row: {
          aplicado_en: string
          aplicado_por: string | null
          creada_en: string
          episodio_id: string | null
          id: string
          instrumento: string
          interpretacion: string | null
          paciente_id: string
          puntuaciones: Json | null
        }
        Insert: {
          aplicado_en?: string
          aplicado_por?: string | null
          creada_en?: string
          episodio_id?: string | null
          id?: string
          instrumento: string
          interpretacion?: string | null
          paciente_id: string
          puntuaciones?: Json | null
        }
        Update: {
          aplicado_en?: string
          aplicado_por?: string | null
          creada_en?: string
          episodio_id?: string | null
          id?: string
          instrumento?: string
          interpretacion?: string | null
          paciente_id?: string
          puntuaciones?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluaciones_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluaciones_aplicado_por_fkey"
            columns: ["aplicado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluaciones_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      informes: {
        Row: {
          autor_id: string
          contenido: string | null
          creado_en: string
          destinatario: string | null
          documento_ruta: string | null
          emitido_en: string | null
          entregado_en: string | null
          episodio_id: string | null
          id: string
          paciente_id: string
          tipo: Database["public"]["Enums"]["tipo_informe"]
          version: number
        }
        Insert: {
          autor_id: string
          contenido?: string | null
          creado_en?: string
          destinatario?: string | null
          documento_ruta?: string | null
          emitido_en?: string | null
          entregado_en?: string | null
          episodio_id?: string | null
          id?: string
          paciente_id: string
          tipo: Database["public"]["Enums"]["tipo_informe"]
          version?: number
        }
        Update: {
          autor_id?: string
          contenido?: string | null
          creado_en?: string
          destinatario?: string | null
          documento_ruta?: string | null
          emitido_en?: string | null
          entregado_en?: string | null
          episodio_id?: string | null
          id?: string
          paciente_id?: string
          tipo?: Database["public"]["Enums"]["tipo_informe"]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "informes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "informes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_clinicas: {
        Row: {
          autor_id: string
          borrador_actualizado_en: string | null
          borrador_autor_id: string | null
          borrador_contenido: Json | null
          creada_en: string
          episodio_id: string | null
          fecha_sesion: string
          id: string
          paciente_id: string
        }
        Insert: {
          autor_id: string
          borrador_actualizado_en?: string | null
          borrador_autor_id?: string | null
          borrador_contenido?: Json | null
          creada_en?: string
          episodio_id?: string | null
          fecha_sesion?: string
          id?: string
          paciente_id: string
        }
        Update: {
          autor_id?: string
          borrador_actualizado_en?: string | null
          borrador_autor_id?: string | null
          borrador_contenido?: Json | null
          creada_en?: string
          episodio_id?: string | null
          fecha_sesion?: string
          id?: string
          paciente_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_clinicas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_borrador_autor_id_fkey"
            columns: ["borrador_autor_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_borrador_autor_id_fkey"
            columns: ["borrador_autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_clinicas_versiones: {
        Row: {
          alcance: Database["public"]["Enums"]["alcance_nota"]
          algoritmo_version: number
          anotaciones_reservadas: string | null
          autor_id: string
          contenido_canonico: string
          creada_en: string
          cuerpo: string
          esquema_version: number
          huella: string
          huella_anterior: string
          id: string
          motivo_cambio: string | null
          nota_id: string
          numero_version: number
        }
        Insert: {
          alcance?: Database["public"]["Enums"]["alcance_nota"]
          algoritmo_version?: number
          anotaciones_reservadas?: string | null
          autor_id: string
          contenido_canonico: string
          creada_en?: string
          cuerpo: string
          esquema_version?: number
          huella: string
          huella_anterior: string
          id?: string
          motivo_cambio?: string | null
          nota_id: string
          numero_version: number
        }
        Update: {
          alcance?: Database["public"]["Enums"]["alcance_nota"]
          algoritmo_version?: number
          anotaciones_reservadas?: string | null
          autor_id?: string
          contenido_canonico?: string
          creada_en?: string
          cuerpo?: string
          esquema_version?: number
          huella?: string
          huella_anterior?: string
          id?: string
          motivo_cambio?: string | null
          nota_id?: string
          numero_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_clinicas_versiones_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_versiones_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_versiones_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacion: {
        Row: {
          actualizado_en: string
          correo: string | null
          creado_en: string
          direccion: string | null
          fila_unica: boolean
          id: string
          minutos_desbloqueo_historia: number
          nif: string
          razon_social: string
          telefono: string | null
          zona_horaria: string
        }
        Insert: {
          actualizado_en?: string
          correo?: string | null
          creado_en?: string
          direccion?: string | null
          fila_unica?: boolean
          id?: string
          minutos_desbloqueo_historia?: number
          nif: string
          razon_social: string
          telefono?: string | null
          zona_horaria?: string
        }
        Update: {
          actualizado_en?: string
          correo?: string | null
          creado_en?: string
          direccion?: string | null
          fila_unica?: boolean
          id?: string
          minutos_desbloqueo_historia?: number
          nif?: string
          razon_social?: string
          telefono?: string | null
          zona_horaria?: string
        }
        Relationships: []
      }
      pacientes: {
        Row: {
          apellidos: string
          centro_id: string | null
          creado_en: string
          fecha_nacimiento: string | null
          fusionado_el: string | null
          fusionado_en: string | null
          fusionado_por: string | null
          id: string
          motivo_fusion: string | null
          motivo_traspaso: string | null
          nombre: string
          profesional_id: string
          titularidad: Database["public"]["Enums"]["titularidad_paciente"]
          traspasado_a: string | null
          traspasado_en: string | null
        }
        Insert: {
          apellidos: string
          centro_id?: string | null
          creado_en?: string
          fecha_nacimiento?: string | null
          fusionado_el?: string | null
          fusionado_en?: string | null
          fusionado_por?: string | null
          id?: string
          motivo_fusion?: string | null
          motivo_traspaso?: string | null
          nombre: string
          profesional_id: string
          titularidad?: Database["public"]["Enums"]["titularidad_paciente"]
          traspasado_a?: string | null
          traspasado_en?: string | null
        }
        Update: {
          apellidos?: string
          centro_id?: string | null
          creado_en?: string
          fecha_nacimiento?: string | null
          fusionado_el?: string | null
          fusionado_en?: string | null
          fusionado_por?: string | null
          id?: string
          motivo_fusion?: string | null
          motivo_traspaso?: string | null
          nombre?: string
          profesional_id?: string
          titularidad?: Database["public"]["Enums"]["titularidad_paciente"]
          traspasado_a?: string | null
          traspasado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_fusionado_por_fkey"
            columns: ["fusionado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_fusionado_por_fkey"
            columns: ["fusionado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_traspasado_a_fkey"
            columns: ["traspasado_a"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_traspasado_a_fkey"
            columns: ["traspasado_a"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes_identificacion: {
        Row: {
          actualizado_en: string
          creado_en: string
          dni_cifrado: string
          dni_clave_version: number
          dni_etiqueta: string
          dni_indice: string
          dni_indice_clave_version: number
          dni_nonce: string
          domicilio_cifrado: string | null
          domicilio_clave_version: number | null
          domicilio_etiqueta: string | null
          domicilio_nonce: string | null
          paciente_id: string
          tipo_documento: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          dni_cifrado: string
          dni_clave_version?: number
          dni_etiqueta: string
          dni_indice: string
          dni_indice_clave_version?: number
          dni_nonce: string
          domicilio_cifrado?: string | null
          domicilio_clave_version?: number | null
          domicilio_etiqueta?: string | null
          domicilio_nonce?: string | null
          paciente_id: string
          tipo_documento: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          dni_cifrado?: string
          dni_clave_version?: number
          dni_etiqueta?: string
          dni_indice?: string
          dni_indice_clave_version?: number
          dni_nonce?: string
          domicilio_cifrado?: string | null
          domicilio_clave_version?: number | null
          domicilio_etiqueta?: string | null
          domicilio_nonce?: string | null
          paciente_id?: string
          tipo_documento?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_identificacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: true
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          centro_id: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_perfil"]
          estado_desde: string
          id: string
          motivo_estado: string | null
          nombre_completo: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Insert: {
          centro_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_perfil"]
          estado_desde?: string
          id: string
          motivo_estado?: string | null
          nombre_completo: string
          rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Update: {
          centro_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_perfil"]
          estado_desde?: string
          id?: string
          motivo_estado?: string | null
          nombre_completo?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles_centros: {
        Row: {
          centro_id: string
          creado_en: string
          desde: string
          hasta: string | null
          id: string
          perfil_id: string
          principal: boolean
        }
        Insert: {
          centro_id: string
          creado_en?: string
          desde?: string
          hasta?: string | null
          id?: string
          perfil_id: string
          principal?: boolean
        }
        Update: {
          centro_id?: string
          creado_en?: string
          desde?: string
          hasta?: string | null
          id?: string
          perfil_id?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_centros_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_centros_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "perfiles_centros_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pines_historia: {
        Row: {
          actualizado_en: string
          bloqueado_hasta: string | null
          creado_en: string
          hash: string
          intentos_fallidos: number
          perfil_id: string
        }
        Insert: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          creado_en?: string
          hash: string
          intentos_fallidos?: number
          perfil_id: string
        }
        Update: {
          actualizado_en?: string
          bloqueado_hasta?: string | null
          creado_en?: string
          hash?: string
          intentos_fallidos?: number
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pines_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pines_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      politicas_retencion: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          anios_historia_clinica: number
          anios_minimo_legal: number
          centro_id: string | null
          creado_en: string
          id: string
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          anios_historia_clinica?: number
          anios_minimo_legal?: number
          centro_id?: string | null
          creado_en?: string
          id?: string
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          anios_historia_clinica?: number
          anios_minimo_legal?: number
          centro_id?: string | null
          creado_en?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "politicas_retencion_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_retencion_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "politicas_retencion_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      preferencias_usuario: {
        Row: {
          actualizado_en: string
          creado_en: string
          densidad_listas: string
          idioma: string
          perfil_id: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          densidad_listas?: string
          idioma?: string
          perfil_id: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          densidad_listas?: string
          idioma?: string
          perfil_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "preferencias_usuario_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "preferencias_usuario_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      representantes_paciente: {
        Row: {
          alcance: Database["public"]["Enums"]["alcance_representacion"]
          apellidos: string
          correo: string | null
          creado_en: string
          creado_por: string | null
          documento_acreditativo_ruta: string | null
          documento_cifrado: string | null
          documento_clave_version: number | null
          documento_etiqueta: string | null
          documento_nonce: string | null
          id: string
          nombre: string
          paciente_id: string
          telefono: string | null
          tipo: Database["public"]["Enums"]["tipo_representante"]
          vigente_desde: string
          vigente_hasta: string | null
        }
        Insert: {
          alcance: Database["public"]["Enums"]["alcance_representacion"]
          apellidos: string
          correo?: string | null
          creado_en?: string
          creado_por?: string | null
          documento_acreditativo_ruta?: string | null
          documento_cifrado?: string | null
          documento_clave_version?: number | null
          documento_etiqueta?: string | null
          documento_nonce?: string | null
          id?: string
          nombre: string
          paciente_id: string
          telefono?: string | null
          tipo: Database["public"]["Enums"]["tipo_representante"]
          vigente_desde: string
          vigente_hasta?: string | null
        }
        Update: {
          alcance?: Database["public"]["Enums"]["alcance_representacion"]
          apellidos?: string
          correo?: string | null
          creado_en?: string
          creado_por?: string | null
          documento_acreditativo_ruta?: string | null
          documento_cifrado?: string | null
          documento_clave_version?: number | null
          documento_etiqueta?: string | null
          documento_nonce?: string | null
          id?: string
          nombre?: string
          paciente_id?: string
          telefono?: string | null
          tipo?: Database["public"]["Enums"]["tipo_representante"]
          vigente_desde?: string
          vigente_hasta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "representantes_paciente_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "representantes_paciente_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "representantes_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      valoraciones_riesgo: {
        Row: {
          descripcion: string | null
          episodio_id: string | null
          id: string
          indicador: boolean | null
          nivel: Database["public"]["Enums"]["nivel_riesgo"]
          paciente_id: string
          plan_seguridad: string | null
          valorado_en: string
          valorado_por: string | null
        }
        Insert: {
          descripcion?: string | null
          episodio_id?: string | null
          id?: string
          indicador?: boolean | null
          nivel: Database["public"]["Enums"]["nivel_riesgo"]
          paciente_id: string
          plan_seguridad?: string | null
          valorado_en?: string
          valorado_por?: string | null
        }
        Update: {
          descripcion?: string | null
          episodio_id?: string | null
          id?: string
          indicador?: boolean | null
          nivel?: Database["public"]["Enums"]["nivel_riesgo"]
          paciente_id?: string
          plan_seguridad?: string | null
          valorado_en?: string
          valorado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "valoraciones_riesgo_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_riesgo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_riesgo_valorado_por_fkey"
            columns: ["valorado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "valoraciones_riesgo_valorado_por_fkey"
            columns: ["valorado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      accesos_historia_resumen: {
        Row: {
          agente: string | null
          desbloqueo_id: string | null
          id: number | null
          iniciado_en: string | null
          ip: unknown
          justificacion: string | null
          paciente_id: string | null
          perfil_id: string | null
          pestana: Database["public"]["Enums"]["pestana_historia"] | null
          tipo: Database["public"]["Enums"]["tipo_acceso_historia"] | null
          ultima_vista_en: string | null
          vistas: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accesos_historia_desbloqueo_id_fkey"
            columns: ["desbloqueo_id"]
            isOneToOne: false
            referencedRelation: "desbloqueos_historia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accesos_historia_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      directorio_perfiles: {
        Row: {
          centro_id: string | null
          estado: Database["public"]["Enums"]["estado_perfil"] | null
          id: string | null
          nombre_completo: string | null
          rol: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Insert: {
          centro_id?: string | null
          estado?: Database["public"]["Enums"]["estado_perfil"] | null
          id?: string | null
          nombre_completo?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Update: {
          centro_id?: string | null
          estado?: Database["public"]["Enums"]["estado_perfil"] | null
          id?: string | null
          nombre_completo?: string | null
          rol?: Database["public"]["Enums"]["rol_usuario"] | null
        }
        Relationships: [
          {
            foreignKeyName: "perfiles_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes_indicador_riesgo: {
        Row: {
          indicador: boolean | null
          paciente_id: string | null
          valorado_en: string | null
        }
        Relationships: [
          {
            foreignKeyName: "valoraciones_riesgo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bloquear_historia: { Args: never; Returns: number }
      capacidad_consentimiento: {
        Args: { p_fecha?: string; p_paciente_id: string }
        Returns: {
          edad: number
          quien: string
          representante_id: string
          requiere_audiencia_menor: boolean
        }[]
      }
      centro_actual: { Args: never; Returns: string }
      centro_principal: { Args: { p_perfil_id: string }; Returns: string }
      centros_actuales: { Args: never; Returns: string[] }
      desbloquear_historia: {
        Args: { p_pin: string }
        Returns: {
          bloqueado_hasta: string
          caduca_en: string
          desbloqueado: boolean
          motivo: string
        }[]
      }
      desbloqueo_propio_vigente: {
        Args: { p_desbloqueo_id: string }
        Returns: boolean
      }
      desbloqueo_vigente: { Args: never; Returns: string }
      es_profesional_asignado: {
        Args: { p_paciente_id: string }
        Returns: boolean
      }
      es_profesional_del_episodio: {
        Args: { p_episodio_id: string }
        Returns: boolean
      }
      es_zona_iana: { Args: { p_zona: string }; Returns: boolean }
      fijar_pin_historia: { Args: { p_pin: string }; Returns: undefined }
      historia_desbloqueada: { Args: never; Returns: boolean }
      nota_tiene_version_conjunta: {
        Args: { p_nota_id: string }
        Returns: boolean
      }
      prolongar_desbloqueo: { Args: never; Returns: string }
      retencion_efectiva: {
        Args: { p_centro_id: string }
        Returns: {
          anios_historia_clinica: number
          anios_minimo_legal: number
          origen: string
        }[]
      }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      zona_horaria_centro: { Args: { p_centro_id: string }; Returns: string }
    }
    Enums: {
      alcance_nota: "individual" | "conjunta"
      alcance_representacion: "patria_potestad" | "custodia" | "solo_contacto"
      estado_perfil: "activo" | "suspendido" | "baja"
      modalidad_relacional: "individual" | "pareja" | "familiar" | "grupo"
      nivel_riesgo: "bajo" | "moderado" | "alto"
      pestana_historia:
        | "historial_clinico"
        | "notas_clinicas"
        | "evaluaciones"
        | "informes"
        | "documentos"
      rol_usuario:
        | "administrador"
        | "profesional_sanitario"
        | "tecnico_administrativo"
      tipo_acceso_historia:
        | "apertura"
        | "exportacion"
        | "informe"
        | "emergencia"
      tipo_alerta_documentacion:
        | "nota_sin_firmar"
        | "borrador_abandonado"
        | "consentimiento_pendiente"
        | "informe_pendiente"
        | "evaluacion_sin_corregir"
      tipo_consentimiento:
        | "asistencial"
        | "terapia_pareja_familiar"
        | "tratamiento_datos"
        | "cesion_informacion"
        | "grabacion"
        | "otro"
      tipo_informe:
        | "alta"
        | "seguimiento"
        | "derivacion"
        | "pericial"
        | "aseguradora"
        | "otro"
      tipo_representante:
        | "progenitor"
        | "tutor"
        | "acogedor"
        | "guardador_de_hecho"
        | "representante_judicial"
      titularidad_paciente: "organizacion" | "profesional"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      alcance_nota: ["individual", "conjunta"],
      alcance_representacion: ["patria_potestad", "custodia", "solo_contacto"],
      estado_perfil: ["activo", "suspendido", "baja"],
      modalidad_relacional: ["individual", "pareja", "familiar", "grupo"],
      nivel_riesgo: ["bajo", "moderado", "alto"],
      pestana_historia: [
        "historial_clinico",
        "notas_clinicas",
        "evaluaciones",
        "informes",
        "documentos",
      ],
      rol_usuario: [
        "administrador",
        "profesional_sanitario",
        "tecnico_administrativo",
      ],
      tipo_acceso_historia: [
        "apertura",
        "exportacion",
        "informe",
        "emergencia",
      ],
      tipo_alerta_documentacion: [
        "nota_sin_firmar",
        "borrador_abandonado",
        "consentimiento_pendiente",
        "informe_pendiente",
        "evaluacion_sin_corregir",
      ],
      tipo_consentimiento: [
        "asistencial",
        "terapia_pareja_familiar",
        "tratamiento_datos",
        "cesion_informacion",
        "grabacion",
        "otro",
      ],
      tipo_informe: [
        "alta",
        "seguimiento",
        "derivacion",
        "pericial",
        "aseguradora",
        "otro",
      ],
      tipo_representante: [
        "progenitor",
        "tutor",
        "acogedor",
        "guardador_de_hecho",
        "representante_judicial",
      ],
      titularidad_paciente: ["organizacion", "profesional"],
    },
  },
} as const

