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
            foreignKeyName: "accesos_historia_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          anulada_en: string | null
          centro_id: string | null
          creada_en: string
          estado: string
          fecha_referencia: string | null
          id: string
          origen_id: string
          origen_tabla: string
          paciente_id: string
          profesional_id: string | null
          referencia_en: string
          resuelta_en: string | null
          tipo: Database["public"]["Enums"]["tipo_alerta_documentacion"]
        }
        Insert: {
          anulada_en?: string | null
          centro_id?: string | null
          creada_en?: string
          estado?: string
          fecha_referencia?: string | null
          id?: string
          origen_id: string
          origen_tabla: string
          paciente_id: string
          profesional_id?: string | null
          referencia_en?: string
          resuelta_en?: string | null
          tipo: Database["public"]["Enums"]["tipo_alerta_documentacion"]
        }
        Update: {
          anulada_en?: string | null
          centro_id?: string | null
          creada_en?: string
          estado?: string
          fecha_referencia?: string | null
          id?: string
          origen_id?: string
          origen_tabla?: string
          paciente_id?: string
          profesional_id?: string | null
          referencia_en?: string
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
            foreignKeyName: "alertas_documentacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
      bonos: {
        Row: {
          caducidad: string | null
          creado_en: string
          creado_por: string
          id: string
          importe: number
          paciente_id: string
          sesiones_totales: number
        }
        Insert: {
          caducidad?: string | null
          creado_en?: string
          creado_por: string
          id?: string
          importe: number
          paciente_id: string
          sesiones_totales: number
        }
        Update: {
          caducidad?: string | null
          creado_en?: string
          creado_por?: string
          id?: string
          importe?: number
          paciente_id?: string
          sesiones_totales?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      bonos_caducidades: {
        Row: {
          bono_id: string
          caducidad: string | null
          id: string
          numero: number
          registrada_en: string
          registrada_por: string
        }
        Insert: {
          bono_id: string
          caducidad?: string | null
          id?: string
          numero: number
          registrada_en?: string
          registrada_por: string
        }
        Update: {
          bono_id?: string
          caducidad?: string | null
          id?: string
          numero?: number
          registrada_en?: string
          registrada_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonos_caducidades_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_caducidades_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos_consumo"
            referencedColumns: ["bono_id"]
          },
          {
            foreignKeyName: "bonos_caducidades_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_caducidades_registrada_por_fkey"
            columns: ["registrada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      borradores_factura: {
        Row: {
          creado_en: string
          creado_por: string
          id: string
          paciente_id: string
          profesional_id: string
        }
        Insert: {
          creado_en?: string
          creado_por: string
          id?: string
          paciente_id: string
          profesional_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          id?: string
          paciente_id?: string
          profesional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "borradores_factura_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "borradores_factura_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      borradores_factura_envios: {
        Row: {
          borrador_id: string
          enviado_en: string
          evento_id: string
          fecha_documento: string
          id: string
          numero_version: number
          paciente_id: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          proyeccion_version: number
          version_id: string
        }
        Insert: {
          borrador_id: string
          enviado_en?: string
          evento_id: string
          fecha_documento: string
          id?: string
          numero_version: number
          paciente_id: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          proyeccion_version: number
          version_id: string
        }
        Update: {
          borrador_id?: string
          enviado_en?: string
          evento_id?: string
          fecha_documento?: string
          id?: string
          numero_version?: number
          paciente_id?: string
          proveedor?: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id?: string
          proyeccion_version?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "borradores_factura_envios_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: true
            referencedRelation: "borradores_factura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_envios_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: true
            referencedRelation: "borradores_factura_estado"
            referencedColumns: ["borrador_id"]
          },
          {
            foreignKeyName: "borradores_factura_envios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_envios_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      borradores_factura_versiones: {
        Row: {
          algoritmo_version: number
          base: number
          borrador_id: string
          centro_id: string | null
          contenido_canonico: string
          creada_en: string
          creada_por: string
          cuota_iva: number
          descartado: boolean
          destinatario_nif_cifrado: string | null
          destinatario_nif_clave_version: number | null
          destinatario_nif_etiqueta: string | null
          destinatario_nif_nonce: string | null
          destinatario_nombre: string
          huella: string
          huella_anterior: string
          id: string
          lineas: Json
          numero_version: number
          paciente_id: string
          profesional_id: string
          total: number
        }
        Insert: {
          algoritmo_version: number
          base: number
          borrador_id: string
          centro_id?: string | null
          contenido_canonico: string
          creada_en?: string
          creada_por: string
          cuota_iva: number
          descartado?: boolean
          destinatario_nif_cifrado?: string | null
          destinatario_nif_clave_version?: number | null
          destinatario_nif_etiqueta?: string | null
          destinatario_nif_nonce?: string | null
          destinatario_nombre: string
          huella: string
          huella_anterior: string
          id?: string
          lineas: Json
          numero_version: number
          paciente_id: string
          profesional_id: string
          total: number
        }
        Update: {
          algoritmo_version?: number
          base?: number
          borrador_id?: string
          centro_id?: string | null
          contenido_canonico?: string
          creada_en?: string
          creada_por?: string
          cuota_iva?: number
          descartado?: boolean
          destinatario_nif_cifrado?: string | null
          destinatario_nif_clave_version?: number | null
          destinatario_nif_etiqueta?: string | null
          destinatario_nif_nonce?: string | null
          destinatario_nombre?: string
          huella?: string
          huella_anterior?: string
          id?: string
          lineas?: Json
          numero_version?: number
          paciente_id?: string
          profesional_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "borradores_factura_versiones_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: false
            referencedRelation: "borradores_factura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: false
            referencedRelation: "borradores_factura_estado"
            referencedColumns: ["borrador_id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borradores_factura_versiones_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      centros: {
        Row: {
          activo: boolean
          codigo_postal: string | null
          creado_en: string
          direccion: string | null
          escalado_nivel2_horas: number | null
          escalado_nivel3_horas: number | null
          id: string
          localidad: string | null
          margen_sesion_minutos: number | null
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
          escalado_nivel2_horas?: number | null
          escalado_nivel3_horas?: number | null
          id?: string
          localidad?: string | null
          margen_sesion_minutos?: number | null
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
          escalado_nivel2_horas?: number | null
          escalado_nivel3_horas?: number | null
          id?: string
          localidad?: string | null
          margen_sesion_minutos?: number | null
          nombre?: string
          provincia?: string | null
          telefono?: string | null
          zona_horaria?: string | null
        }
        Relationships: []
      }
      citas: {
        Row: {
          bono_id: string | null
          centro_id: string | null
          creada_en: string
          creada_por: string | null
          desviada: boolean
          episodio_id: string | null
          estado: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id: string
          inicio: string
          marcada_realizada_en: string | null
          marcada_realizada_por: string | null
          modalidad_asistencia: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_desviacion:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          nota_operativa: string | null
          paciente_id: string
          profesional_id: string
          rango_bloqueante: unknown
          sala: string | null
          serie_id: string | null
          tipo_terapia_id: string | null
          zona_horaria: string
        }
        Insert: {
          bono_id?: string | null
          centro_id?: string | null
          creada_en?: string
          creada_por?: string | null
          desviada?: boolean
          episodio_id?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id?: string
          inicio: string
          marcada_realizada_en?: string | null
          marcada_realizada_por?: string | null
          modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_desviacion?:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          nota_operativa?: string | null
          paciente_id: string
          profesional_id: string
          rango_bloqueante: unknown
          sala?: string | null
          serie_id?: string | null
          tipo_terapia_id?: string | null
          zona_horaria: string
        }
        Update: {
          bono_id?: string | null
          centro_id?: string | null
          creada_en?: string
          creada_por?: string | null
          desviada?: boolean
          episodio_id?: string | null
          estado?: Database["public"]["Enums"]["estado_cita"]
          fin?: string
          id?: string
          inicio?: string
          marcada_realizada_en?: string | null
          marcada_realizada_por?: string | null
          modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_desviacion?:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          nota_operativa?: string | null
          paciente_id?: string
          profesional_id?: string
          rango_bloqueante?: unknown
          sala?: string | null
          serie_id?: string | null
          tipo_terapia_id?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "citas_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_bono_id_fkey"
            columns: ["bono_id"]
            isOneToOne: false
            referencedRelation: "bonos_consumo"
            referencedColumns: ["bono_id"]
          },
          {
            foreignKeyName: "citas_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_marcada_realizada_por_fkey"
            columns: ["marcada_realizada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_marcada_realizada_por_fkey"
            columns: ["marcada_realizada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_cita"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_tipo_terapia_id_fkey"
            columns: ["tipo_terapia_id"]
            isOneToOne: false
            referencedRelation: "tipos_terapia"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          factura_espejo_id: string | null
          fecha: string
          forma_pago: Database["public"]["Enums"]["forma_pago"]
          id: string
          importe: number
          motivo: string | null
          paciente_id: string
          referencia: string | null
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          factura_espejo_id?: string | null
          fecha: string
          forma_pago: Database["public"]["Enums"]["forma_pago"]
          id?: string
          importe: number
          motivo?: string | null
          paciente_id: string
          referencia?: string | null
          registrado_en?: string
          registrado_por: string
        }
        Update: {
          factura_espejo_id?: string | null
          fecha?: string
          forma_pago?: Database["public"]["Enums"]["forma_pago"]
          id?: string
          importe?: number
          motivo?: string | null
          paciente_id?: string
          referencia?: string | null
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "cobros_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros_facturas: {
        Row: {
          cobro_id: string
          creada_en: string
          creada_por: string
          factura_espejo_id: string
          id: string
        }
        Insert: {
          cobro_id: string
          creada_en?: string
          creada_por?: string
          factura_espejo_id: string
          id?: string
        }
        Update: {
          cobro_id?: string
          creada_en?: string
          creada_por?: string
          factura_espejo_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_facturas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_facturas_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      codigos_recuperacion_totp: {
        Row: {
          bloqueado_hasta: string | null
          canje_autorizado_hasta: string | null
          canje_autorizado_id: string | null
          codigo_hash: string
          creado_en: string
          id: string
          intentos_fallidos: number
          perfil_id: string
          usado_en: string | null
        }
        Insert: {
          bloqueado_hasta?: string | null
          canje_autorizado_hasta?: string | null
          canje_autorizado_id?: string | null
          codigo_hash: string
          creado_en?: string
          id?: string
          intentos_fallidos?: number
          perfil_id: string
          usado_en?: string | null
        }
        Update: {
          bloqueado_hasta?: string | null
          canje_autorizado_hasta?: string | null
          canje_autorizado_id?: string | null
          codigo_hash?: string
          creado_en?: string
          id?: string
          intentos_fallidos?: number
          perfil_id?: string
          usado_en?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codigos_recuperacion_totp_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codigos_recuperacion_totp_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "consentimiento_firmantes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          {
            foreignKeyName: "consentimientos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          {
            foreignKeyName: "diagnosticos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      disponibilidad: {
        Row: {
          centro_id: string | null
          creado_en: string
          creado_por: string | null
          desde: string | null
          dia_semana: number | null
          hasta: string | null
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          motivo: string | null
          perfil_id: string
          tipo: Database["public"]["Enums"]["tipo_disponibilidad"]
          zona_horaria: string
        }
        Insert: {
          centro_id?: string | null
          creado_en?: string
          creado_por?: string | null
          desde?: string | null
          dia_semana?: number | null
          hasta?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          perfil_id: string
          tipo: Database["public"]["Enums"]["tipo_disponibilidad"]
          zona_horaria: string
        }
        Update: {
          centro_id?: string | null
          creado_en?: string
          creado_por?: string | null
          desde?: string | null
          dia_semana?: number | null
          hasta?: string | null
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          motivo?: string | null
          perfil_id?: string
          tipo?: Database["public"]["Enums"]["tipo_disponibilidad"]
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "disponibilidad_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disponibilidad_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
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
          {
            foreignKeyName: "episodio_participantes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
            foreignKeyName: "episodios_asistenciales_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          {
            foreignKeyName: "evaluaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      eventos_salientes: {
        Row: {
          actualizado_en: string
          carga: Json
          clave_idempotencia: string | null
          creado_en: string
          creado_por: string | null
          estado: Database["public"]["Enums"]["estado_evento_saliente"]
          id: string
          intentos: number
          proximo_intento: string | null
          tipo: string
          ultimo_error: string | null
        }
        Insert: {
          actualizado_en?: string
          carga: Json
          clave_idempotencia?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_evento_saliente"]
          id?: string
          intentos?: number
          proximo_intento?: string | null
          tipo: string
          ultimo_error?: string | null
        }
        Update: {
          actualizado_en?: string
          carga?: Json
          clave_idempotencia?: string | null
          creado_en?: string
          creado_por?: string | null
          estado?: Database["public"]["Enums"]["estado_evento_saliente"]
          id?: string
          intentos?: number
          proximo_intento?: string | null
          tipo?: string
          ultimo_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "eventos_salientes_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eventos_salientes_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exportaciones: {
        Row: {
          acceso_id: number
          algoritmo: string
          creada_en: string
          formato_version: number
          id: string
          motivo: Database["public"]["Enums"]["motivo_exportacion"] | null
          nota_id: string
          paciente_id: string
          parametros_kdf: Json
          perfil_id: string
          proyeccion: Database["public"]["Enums"]["proyeccion_exportacion"]
          referencia: string | null
          versiones: number[]
        }
        Insert: {
          acceso_id: number
          algoritmo: string
          creada_en?: string
          formato_version: number
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_exportacion"] | null
          nota_id: string
          paciente_id: string
          parametros_kdf: Json
          perfil_id: string
          proyeccion: Database["public"]["Enums"]["proyeccion_exportacion"]
          referencia?: string | null
          versiones: number[]
        }
        Update: {
          acceso_id?: number
          algoritmo?: string
          creada_en?: string
          formato_version?: number
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_exportacion"] | null
          nota_id?: string
          paciente_id?: string
          parametros_kdf?: Json
          perfil_id?: string
          proyeccion?: Database["public"]["Enums"]["proyeccion_exportacion"]
          referencia?: string | null
          versiones?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "exportaciones_nota_id_fkey"
            columns: ["nota_id"]
            isOneToOne: false
            referencedRelation: "notas_clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exportaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exportaciones_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "exportaciones_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exportaciones_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exportaciones_ficheros: {
        Row: {
          exportacion_id: string
          huella_fichero: string
          registrado_en: string
        }
        Insert: {
          exportacion_id: string
          huella_fichero: string
          registrado_en?: string
        }
        Update: {
          exportacion_id?: string
          huella_fichero?: string
          registrado_en?: string
        }
        Relationships: []
      }
      facturacion_ajuste: {
        Row: {
          actualizado_en: string
          actualizado_por: string | null
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"] | null
          secreto_id: string | null
          sincronizado_hasta: string | null
          unico: boolean
        }
        Insert: {
          actualizado_en?: string
          actualizado_por?: string | null
          proveedor?:
            | Database["public"]["Enums"]["proveedor_facturacion"]
            | null
          secreto_id?: string | null
          sincronizado_hasta?: string | null
          unico?: boolean
        }
        Update: {
          actualizado_en?: string
          actualizado_por?: string | null
          proveedor?:
            | Database["public"]["Enums"]["proveedor_facturacion"]
            | null
          secreto_id?: string | null
          sincronizado_hasta?: string | null
          unico?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "facturacion_ajuste_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturacion_ajuste_actualizado_por_fkey"
            columns: ["actualizado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas_anotaciones: {
        Row: {
          borrador_id: string
          id: string
          observada_en: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          tipo: Database["public"]["Enums"]["anotacion_documento_proveedor"]
        }
        Insert: {
          borrador_id: string
          id?: string
          observada_en?: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          tipo: Database["public"]["Enums"]["anotacion_documento_proveedor"]
        }
        Update: {
          borrador_id?: string
          id?: string
          observada_en?: string
          proveedor?: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id?: string
          tipo?: Database["public"]["Enums"]["anotacion_documento_proveedor"]
        }
        Relationships: [
          {
            foreignKeyName: "facturas_anotaciones_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: false
            referencedRelation: "borradores_factura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_anotaciones_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: false
            referencedRelation: "borradores_factura_estado"
            referencedColumns: ["borrador_id"]
          },
        ]
      }
      facturas_espejo: {
        Row: {
          base: number
          borrador_id: string
          copiado_en: string
          cuota_iva: number
          fecha_expedicion: string
          id: string
          numero: string
          paciente_id: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          total: number
          url_proveedor: string
        }
        Insert: {
          base: number
          borrador_id: string
          copiado_en?: string
          cuota_iva: number
          fecha_expedicion: string
          id?: string
          numero: string
          paciente_id: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id: string
          total: number
          url_proveedor: string
        }
        Update: {
          base?: number
          borrador_id?: string
          copiado_en?: string
          cuota_iva?: number
          fecha_expedicion?: string
          id?: string
          numero?: string
          paciente_id?: string
          proveedor?: Database["public"]["Enums"]["proveedor_facturacion"]
          proveedor_documento_id?: string
          total?: number
          url_proveedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "facturas_espejo_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: true
            referencedRelation: "borradores_factura"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_espejo_borrador_id_fkey"
            columns: ["borrador_id"]
            isOneToOne: true
            referencedRelation: "borradores_factura_estado"
            referencedColumns: ["borrador_id"]
          },
          {
            foreignKeyName: "facturas_espejo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_espejo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          {
            foreignKeyName: "informes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      intentos_regenerar_codigos: {
        Row: {
          actualizado_en: string
          autorizado_hasta: string | null
          bloqueado_hasta: string | null
          intentos_fallidos: number
          perfil_id: string
          regeneraciones_autorizadas: number
        }
        Insert: {
          actualizado_en?: string
          autorizado_hasta?: string | null
          bloqueado_hasta?: string | null
          intentos_fallidos?: number
          perfil_id: string
          regeneraciones_autorizadas?: number
        }
        Update: {
          actualizado_en?: string
          autorizado_hasta?: string | null
          bloqueado_hasta?: string | null
          intentos_fallidos?: number
          perfil_id?: string
          regeneraciones_autorizadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "intentos_regenerar_codigos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intentos_regenerar_codigos_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_clinicas: {
        Row: {
          autor_id: string
          borrador_abierta_en: string | null
          borrador_actualizado_en: string | null
          borrador_autor_id: string | null
          borrador_contenido: Json | null
          cita_id: string | null
          coprofesional_id: string | null
          creada_en: string
          episodio_id: string
          fecha_sesion: string
          id: string
          paciente_id: string
        }
        Insert: {
          autor_id: string
          borrador_abierta_en?: string | null
          borrador_actualizado_en?: string | null
          borrador_autor_id?: string | null
          borrador_contenido?: Json | null
          cita_id?: string | null
          coprofesional_id?: string | null
          creada_en?: string
          episodio_id: string
          fecha_sesion?: string
          id?: string
          paciente_id: string
        }
        Update: {
          autor_id?: string
          borrador_abierta_en?: string | null
          borrador_actualizado_en?: string | null
          borrador_autor_id?: string | null
          borrador_contenido?: Json | null
          cita_id?: string | null
          coprofesional_id?: string | null
          creada_en?: string
          episodio_id?: string
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
            foreignKeyName: "notas_clinicas_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas_agenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_coprofesional_id_fkey"
            columns: ["coprofesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notas_clinicas_coprofesional_id_fkey"
            columns: ["coprofesional_id"]
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
          {
            foreignKeyName: "notas_clinicas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          paciente_id: string
          posicion_cadena: number
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
          paciente_id: string
          posicion_cadena: number
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
          paciente_id?: string
          posicion_cadena?: number
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
      notificaciones: {
        Row: {
          creado_en: string
          detalle: string
          id: string
          leida_en: string | null
          origen_id: string | null
          origen_tabla: string | null
          perfil_id: string
          tipo: string
          titulo: string | null
        }
        Insert: {
          creado_en?: string
          detalle: string
          id?: string
          leida_en?: string | null
          origen_id?: string | null
          origen_tabla?: string | null
          perfil_id: string
          tipo: string
          titulo?: string | null
        }
        Update: {
          creado_en?: string
          detalle?: string
          id?: string
          leida_en?: string | null
          origen_id?: string | null
          origen_tabla?: string | null
          perfil_id?: string
          tipo?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notificaciones_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificaciones_perfil_id_fkey"
            columns: ["perfil_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizacion: {
        Row: {
          actualizado_en: string
          administrador_avisos_id: string | null
          correo: string | null
          creado_en: string
          direccion: string | null
          escalado_nivel2_horas: number
          escalado_nivel3_horas: number
          fila_unica: boolean
          id: string
          margen_sesion_minutos: number
          minutos_desbloqueo_historia: number
          nif: string
          razon_social: string
          telefono: string | null
          zona_horaria: string
        }
        Insert: {
          actualizado_en?: string
          administrador_avisos_id?: string | null
          correo?: string | null
          creado_en?: string
          direccion?: string | null
          escalado_nivel2_horas?: number
          escalado_nivel3_horas?: number
          fila_unica?: boolean
          id?: string
          margen_sesion_minutos?: number
          minutos_desbloqueo_historia?: number
          nif: string
          razon_social: string
          telefono?: string | null
          zona_horaria?: string
        }
        Update: {
          actualizado_en?: string
          administrador_avisos_id?: string | null
          correo?: string | null
          creado_en?: string
          direccion?: string | null
          escalado_nivel2_horas?: number
          escalado_nivel3_horas?: number
          fila_unica?: boolean
          id?: string
          margen_sesion_minutos?: number
          minutos_desbloqueo_historia?: number
          nif?: string
          razon_social?: string
          telefono?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizacion_administrador_avisos_id_fkey"
            columns: ["administrador_avisos_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizacion_administrador_avisos_id_fkey"
            columns: ["administrador_avisos_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
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
          sexo: Database["public"]["Enums"]["sexo_administrativo"] | null
          telefono: string | null
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
          sexo?: Database["public"]["Enums"]["sexo_administrativo"] | null
          telefono?: string | null
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
          sexo?: Database["public"]["Enums"]["sexo_administrativo"] | null
          telefono?: string | null
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
            foreignKeyName: "pacientes_fusionado_en_fkey"
            columns: ["fusionado_en"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          dni_cifrado: string | null
          dni_clave_version: number
          dni_etiqueta: string | null
          dni_indice: string | null
          dni_indice_clave_version: number
          dni_nonce: string | null
          domicilio_cifrado: string | null
          domicilio_clave_version: number | null
          domicilio_etiqueta: string | null
          domicilio_nonce: string | null
          paciente_id: string
          tipo_documento: string | null
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          dni_cifrado?: string | null
          dni_clave_version?: number
          dni_etiqueta?: string | null
          dni_indice?: string | null
          dni_indice_clave_version?: number
          dni_nonce?: string | null
          domicilio_cifrado?: string | null
          domicilio_clave_version?: number | null
          domicilio_etiqueta?: string | null
          domicilio_nonce?: string | null
          paciente_id: string
          tipo_documento?: string | null
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          dni_cifrado?: string | null
          dni_clave_version?: number
          dni_etiqueta?: string | null
          dni_indice?: string | null
          dni_indice_clave_version?: number
          dni_nonce?: string | null
          domicilio_cifrado?: string | null
          domicilio_clave_version?: number | null
          domicilio_etiqueta?: string | null
          domicilio_nonce?: string | null
          paciente_id?: string
          tipo_documento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_identificacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: true
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_identificacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: true
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      pacientes_salud_basica: {
        Row: {
          alergias: string | null
          id: string
          medicacion_actual: string | null
          paciente_id: string
          registrado_en: string
          registrado_por: string
        }
        Insert: {
          alergias?: string | null
          id?: string
          medicacion_actual?: string | null
          paciente_id: string
          registrado_en?: string
          registrado_por: string
        }
        Update: {
          alergias?: string | null
          id?: string
          medicacion_actual?: string | null
          paciente_id?: string
          registrado_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_salud_basica_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_salud_basica_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "pacientes_salud_basica_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_salud_basica_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfiles: {
        Row: {
          centro_id: string | null
          creado_en: string
          descanso_activo: boolean
          descanso_minutos: number
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
          descanso_activo?: boolean
          descanso_minutos?: number
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
          descanso_activo?: boolean
          descanso_minutos?: number
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
          autorizado_hasta: string | null
          bloqueado_hasta: string | null
          creado_en: string
          desbloqueos_autorizados: number
          hash: string
          intentos_fallidos: number
          perfil_id: string
        }
        Insert: {
          actualizado_en?: string
          autorizado_hasta?: string | null
          bloqueado_hasta?: string | null
          creado_en?: string
          desbloqueos_autorizados?: number
          hash: string
          intentos_fallidos?: number
          perfil_id: string
        }
        Update: {
          actualizado_en?: string
          autorizado_hasta?: string | null
          bloqueado_hasta?: string | null
          creado_en?: string
          desbloqueos_autorizados?: number
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
      propuestas_cita: {
        Row: {
          centro_id: string | null
          cita_id: string | null
          cita_resultante_id: string | null
          creada_en: string
          creada_por: string | null
          estado: Database["public"]["Enums"]["estado_propuesta_cita"]
          evento_id: string | null
          fecha_prevista: string
          fin_propuesto: string | null
          hora_local_prevista: string
          id: string
          inicio_propuesto: string | null
          motivo: Database["public"]["Enums"]["motivo_propuesta_cita"]
          paciente_id: string
          profesional_id: string
          resuelta_en: string | null
          resuelta_por: string | null
          serie_id: string | null
          zona_horaria: string
        }
        Insert: {
          centro_id?: string | null
          cita_id?: string | null
          cita_resultante_id?: string | null
          creada_en?: string
          creada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_propuesta_cita"]
          evento_id?: string | null
          fecha_prevista: string
          fin_propuesto?: string | null
          hora_local_prevista: string
          id?: string
          inicio_propuesto?: string | null
          motivo: Database["public"]["Enums"]["motivo_propuesta_cita"]
          paciente_id: string
          profesional_id: string
          resuelta_en?: string | null
          resuelta_por?: string | null
          serie_id?: string | null
          zona_horaria: string
        }
        Update: {
          centro_id?: string | null
          cita_id?: string | null
          cita_resultante_id?: string | null
          creada_en?: string
          creada_por?: string | null
          estado?: Database["public"]["Enums"]["estado_propuesta_cita"]
          evento_id?: string | null
          fecha_prevista?: string
          fin_propuesto?: string | null
          hora_local_prevista?: string
          id?: string
          inicio_propuesto?: string | null
          motivo?: Database["public"]["Enums"]["motivo_propuesta_cita"]
          paciente_id?: string
          profesional_id?: string
          resuelta_en?: string | null
          resuelta_por?: string | null
          serie_id?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "propuestas_cita_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_cita_id_fkey"
            columns: ["cita_id"]
            isOneToOne: false
            referencedRelation: "citas_agenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_cita_resultante_id_fkey"
            columns: ["cita_resultante_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_cita_resultante_id_fkey"
            columns: ["cita_resultante_id"]
            isOneToOne: false
            referencedRelation: "citas_agenda"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos_salientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "propuestas_cita_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_resuelta_por_fkey"
            columns: ["resuelta_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "propuestas_cita_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_cita"
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
          {
            foreignKeyName: "representantes_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      series_cita: {
        Row: {
          cancelada_en: string | null
          centro_id: string | null
          creada_en: string
          creada_por: string | null
          dia_semana: number
          duracion_minutos: number
          episodio_id: string | null
          fin_el: string | null
          hora_local: string
          id: string
          modalidad_asistencia: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_cancelacion: string | null
          paciente_id: string
          periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
          profesional_id: string
          sesiones_totales: number | null
          tipo_terapia_id: string | null
          zona_horaria: string
        }
        Insert: {
          cancelada_en?: string | null
          centro_id?: string | null
          creada_en?: string
          creada_por?: string | null
          dia_semana: number
          duracion_minutos?: number
          episodio_id?: string | null
          fin_el?: string | null
          hora_local: string
          id?: string
          modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_cancelacion?: string | null
          paciente_id: string
          periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
          profesional_id: string
          sesiones_totales?: number | null
          tipo_terapia_id?: string | null
          zona_horaria: string
        }
        Update: {
          cancelada_en?: string | null
          centro_id?: string | null
          creada_en?: string
          creada_por?: string | null
          dia_semana?: number
          duracion_minutos?: number
          episodio_id?: string | null
          fin_el?: string | null
          hora_local?: string
          id?: string
          modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_cancelacion?: string | null
          paciente_id?: string
          periodicidad?: Database["public"]["Enums"]["periodicidad_serie"]
          profesional_id?: string
          sesiones_totales?: number | null
          tipo_terapia_id?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_cita_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_episodio_id_fkey"
            columns: ["episodio_id"]
            isOneToOne: false
            referencedRelation: "episodios_asistenciales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "series_cita_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_cita_tipo_terapia_id_fkey"
            columns: ["tipo_terapia_id"]
            isOneToOne: false
            referencedRelation: "tipos_terapia"
            referencedColumns: ["id"]
          },
        ]
      }
      tablas_solo_adicion: {
        Row: {
          motivo: string
          tabla: string
        }
        Insert: {
          motivo: string
          tabla: string
        }
        Update: {
          motivo?: string
          tabla?: string
        }
        Relationships: []
      }
      tarifas_paciente: {
        Row: {
          creada_en: string
          creada_por: string
          id: string
          importe: number
          orden: number
          paciente_id: string
          regimen_iva: Database["public"]["Enums"]["regimen_iva"]
          tipo_terapia_id: string
          vigente_desde: string
        }
        Insert: {
          creada_en?: string
          creada_por: string
          id?: string
          importe: number
          orden: number
          paciente_id: string
          regimen_iva: Database["public"]["Enums"]["regimen_iva"]
          tipo_terapia_id: string
          vigente_desde: string
        }
        Update: {
          creada_en?: string
          creada_por?: string
          id?: string
          importe?: number
          orden?: number
          paciente_id?: string
          regimen_iva?: Database["public"]["Enums"]["regimen_iva"]
          tipo_terapia_id?: string
          vigente_desde?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_paciente_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifas_paciente_creada_por_fkey"
            columns: ["creada_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifas_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifas_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "tarifas_paciente_tipo_terapia_id_fkey"
            columns: ["tipo_terapia_id"]
            isOneToOne: false
            referencedRelation: "tipos_terapia"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_terapia: {
        Row: {
          activo: boolean
          color: string | null
          creado_en: string
          creado_por: string | null
          duracion_minutos: number
          id: string
          nombre: string
          regimen: Database["public"]["Enums"]["regimen_iva"]
          tarifa_base: number | null
        }
        Insert: {
          activo?: boolean
          color?: string | null
          creado_en?: string
          creado_por?: string | null
          duracion_minutos?: number
          id?: string
          nombre: string
          regimen?: Database["public"]["Enums"]["regimen_iva"]
          tarifa_base?: number | null
        }
        Update: {
          activo?: boolean
          color?: string | null
          creado_en?: string
          creado_por?: string | null
          duracion_minutos?: number
          id?: string
          nombre?: string
          regimen?: Database["public"]["Enums"]["regimen_iva"]
          tarifa_base?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_terapia_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tipos_terapia_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
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
            foreignKeyName: "valoraciones_riesgo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
            foreignKeyName: "accesos_historia_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
      alertas_documentacion_nivel: {
        Row: {
          centro_id: string | null
          creada_en: string | null
          estado: string | null
          fecha_referencia: string | null
          id: string | null
          nivel: number | null
          origen_id: string | null
          origen_tabla: string | null
          paciente_id: string | null
          profesional_id: string | null
          referencia_en: string | null
          tipo: Database["public"]["Enums"]["tipo_alerta_documentacion"] | null
        }
        Insert: {
          centro_id?: string | null
          creada_en?: string | null
          estado?: string | null
          fecha_referencia?: string | null
          id?: string | null
          nivel?: never
          origen_id?: string | null
          origen_tabla?: string | null
          paciente_id?: string | null
          profesional_id?: string | null
          referencia_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_alerta_documentacion"] | null
        }
        Update: {
          centro_id?: string | null
          creada_en?: string | null
          estado?: string | null
          fecha_referencia?: string | null
          id?: string | null
          nivel?: never
          origen_id?: string | null
          origen_tabla?: string | null
          paciente_id?: string | null
          profesional_id?: string | null
          referencia_en?: string | null
          tipo?: Database["public"]["Enums"]["tipo_alerta_documentacion"] | null
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
            foreignKeyName: "alertas_documentacion_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
      bonos_consumo: {
        Row: {
          bono_id: string | null
          caducidad: string | null
          paciente_id: string | null
          sesiones_consumidas: number | null
          sesiones_totales: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bonos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      borradores_factura_estado: {
        Row: {
          borrador_id: string | null
          envio_ambiguo: boolean | null
          estado: string | null
          ultima_version: number | null
        }
        Relationships: []
      }
      citas_agenda: {
        Row: {
          centro_id: string | null
          desviada: boolean | null
          estado: Database["public"]["Enums"]["estado_cita"] | null
          fin: string | null
          id: string | null
          inicio: string | null
          modalidad_asistencia:
            | Database["public"]["Enums"]["modalidad_asistencia"]
            | null
          motivo_desviacion:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          paciente_id: string | null
          profesional_id: string | null
          sala: string | null
          serie_id: string | null
          zona_horaria: string | null
        }
        Insert: {
          centro_id?: string | null
          desviada?: boolean | null
          estado?: Database["public"]["Enums"]["estado_cita"] | null
          fin?: string | null
          id?: string | null
          inicio?: string | null
          modalidad_asistencia?:
            | Database["public"]["Enums"]["modalidad_asistencia"]
            | null
          motivo_desviacion?:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          paciente_id?: string | null
          profesional_id?: string | null
          sala?: string | null
          serie_id?: string | null
          zona_horaria?: string | null
        }
        Update: {
          centro_id?: string | null
          desviada?: boolean | null
          estado?: Database["public"]["Enums"]["estado_cita"] | null
          fin?: string | null
          id?: string | null
          inicio?: string | null
          modalidad_asistencia?:
            | Database["public"]["Enums"]["modalidad_asistencia"]
            | null
          motivo_desviacion?:
            | Database["public"]["Enums"]["motivo_desviacion_cita"]
            | null
          paciente_id?: string | null
          profesional_id?: string | null
          sala?: string | null
          serie_id?: string | null
          zona_horaria?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "citas_centro_id_fkey"
            columns: ["centro_id"]
            isOneToOne: false
            referencedRelation: "centros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "directorio_perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_cita"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros_por_factura: {
        Row: {
          cobro_id: string | null
          enlazado_en: string | null
          factura_espejo_id: string | null
          fecha: string | null
          forma_pago: Database["public"]["Enums"]["forma_pago"] | null
          importe: number | null
          motivo: string | null
          paciente_id: string | null
          referencia: string | null
          via: string | null
        }
        Relationships: []
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
      facturas_espejo_cabecera: {
        Row: {
          base: number | null
          copiado_en: string | null
          cuota_iva: number | null
          fecha_expedicion: string | null
          id: string | null
          numero: string | null
          paciente_id: string | null
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"] | null
          total: number | null
          url_proveedor: string | null
        }
        Insert: {
          base?: number | null
          copiado_en?: string | null
          cuota_iva?: number | null
          fecha_expedicion?: string | null
          id?: string | null
          numero?: string | null
          paciente_id?: string | null
          proveedor?:
            | Database["public"]["Enums"]["proveedor_facturacion"]
            | null
          total?: number | null
          url_proveedor?: string | null
        }
        Update: {
          base?: number | null
          copiado_en?: string | null
          cuota_iva?: number | null
          fecha_expedicion?: string | null
          id?: string | null
          numero?: string | null
          paciente_id?: string | null
          proveedor?:
            | Database["public"]["Enums"]["proveedor_facturacion"]
            | null
          total?: number | null
          url_proveedor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facturas_espejo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_espejo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
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
          {
            foreignKeyName: "valoraciones_riesgo_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
        ]
      }
      pendiente_paciente: {
        Row: {
          citas_sin_tarifa: number | null
          cobrado_centimos: number | null
          devengado_centimos: number | null
          estado: string | null
          excedente_centimos: number | null
          paciente_id: string | null
          pendiente_centimos: number | null
          profesional_id: string | null
        }
        Relationships: [
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
        ]
      }
      tarifas_paciente_vigencias: {
        Row: {
          importe: number | null
          orden: number | null
          paciente_id: string | null
          regimen_iva: Database["public"]["Enums"]["regimen_iva"] | null
          tarifa_id: string | null
          tipo_terapia_id: string | null
          vigente_desde: string | null
          vigente_hasta: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifas_paciente_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pendiente_paciente"
            referencedColumns: ["paciente_id"]
          },
          {
            foreignKeyName: "tarifas_paciente_tipo_terapia_id_fkey"
            columns: ["tipo_terapia_id"]
            isOneToOne: false
            referencedRelation: "tipos_terapia"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agenda_actualizar_cita: {
        Args: {
          p_cita_id: string
          p_estado?: Database["public"]["Enums"]["estado_cita"]
          p_fin?: string
          p_inicio?: string
          p_sala?: string
        }
        Returns: string
      }
      agenda_bloques_profesional: {
        Args: {
          p_centro_id: string
          p_desde: string
          p_duracion_minutos: number
          p_hasta: string
          p_profesional_id: string
        }
        Returns: {
          estado: string
          fecha: string
          fin: string
          hora_local: string
          hueco_raro_minutos: number
          inicio: string
        }[]
      }
      agenda_cambiar_asistencia: {
        Args: {
          p_cita_id: string
          p_modalidad_asistencia: Database["public"]["Enums"]["modalidad_asistencia"]
        }
        Returns: string
      }
      agenda_cambiar_episodio_cita: {
        Args: { p_cita_id: string; p_episodio_id: string }
        Returns: string
      }
      agenda_cancelar_cita: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_cambio_serie"]
          p_cita_id: string
          p_motivo?: string
        }
        Returns: Json
      }
      agenda_citas_rango: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          centro_id: string
          centro_nombre: string
          desviada: boolean
          en_curso: boolean
          estado: Database["public"]["Enums"]["estado_cita"]
          fin: string
          id: string
          inicio: string
          modalidad_asistencia: Database["public"]["Enums"]["modalidad_asistencia"]
          motivo_desviacion: Database["public"]["Enums"]["motivo_desviacion_cita"]
          nota_operativa: string
          nota_pendiente: boolean
          paciente_apellidos: string
          paciente_id: string
          paciente_nombre: string
          profesional_id: string
          profesional_nombre: string
          reprogramable: boolean
          sala: string
          serie_id: string
          tipo_terapia_nombre: string
          zona_horaria: string
        }[]
      }
      agenda_confirmar_propuesta: {
        Args: { p_propuesta_id: string }
        Returns: string
      }
      agenda_crear_cita: {
        Args: {
          p_centro_id: string
          p_duracion_minutos?: number
          p_episodio_id?: string
          p_fecha: string
          p_hora_local: string
          p_modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          p_nota_operativa?: string
          p_paciente_id: string
          p_profesional_id: string
          p_sala?: string
          p_tipo_terapia_id: string
        }
        Returns: string
      }
      agenda_crear_serie: {
        Args: {
          p_centro_id: string
          p_desde: string
          p_dia_semana: number
          p_duracion_minutos: number
          p_episodio_id?: string
          p_estricta_primera?: boolean
          p_excluir?: string[]
          p_fin_el?: string
          p_hora_local: string
          p_modalidad_asistencia?: Database["public"]["Enums"]["modalidad_asistencia"]
          p_nota_operativa?: string
          p_paciente_id: string
          p_periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
          p_profesional_id: string
          p_sala?: string
          p_sesiones_totales?: number
          p_tipo_terapia_id: string
        }
        Returns: Json
      }
      agenda_descartar_propuesta: {
        Args: { p_propuesta_id: string }
        Returns: undefined
      }
      agenda_densidad_anual: {
        Args: {
          p_centro_id?: string
          p_desde: string
          p_hasta: string
          p_profesional_id?: string
          p_zona: string
        }
        Returns: {
          dia: string
          recuento: number
        }[]
      }
      agenda_editar_serie: {
        Args: {
          p_alcance: Database["public"]["Enums"]["alcance_cambio_serie"]
          p_cita_id: string
          p_dia_semana?: number
          p_duracion_minutos?: number
          p_estado?: Database["public"]["Enums"]["estado_cita"]
          p_fecha?: string
          p_fin?: string
          p_hora_local?: string
          p_inicio?: string
          p_sala?: string
          p_zona_horaria?: string
        }
        Returns: Json
      }
      agenda_previsualizar_alta: {
        Args: {
          p_centro_id: string
          p_desde: string
          p_dia_semana: number
          p_duracion_minutos: number
          p_hora_local: string
          p_paciente_id: string
          p_periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
          p_profesional_id: string
          p_sesiones_totales: number
        }
        Returns: Json
      }
      agenda_previsualizar_edicion_serie: {
        Args: {
          p_cita_id: string
          p_dia_semana?: number
          p_duracion_minutos?: number
          p_fecha?: string
          p_hora_local?: string
          p_zona_horaria?: string
        }
        Returns: Json
      }
      agenda_profesionales_anuales: {
        Args: {
          p_centro_id?: string
          p_desde: string
          p_hasta: string
          p_zona: string
        }
        Returns: {
          profesional_id: string
          profesional_nombre: string
        }[]
      }
      agenda_propuestas_de_evento: {
        Args: { p_evento_id: string }
        Returns: Json
      }
      alta_bloqueo_disponibilidad: {
        Args: {
          p_centro_id: string
          p_fecha: string
          p_fin: string
          p_inicio: string
          p_profesional_id: string
        }
        Returns: Database["public"]["Enums"]["tipo_disponibilidad"]
      }
      alta_descanso: { Args: { p_profesional_id: string }; Returns: string }
      alta_exigir_profesional: {
        Args: { p_profesional_id: string }
        Returns: undefined
      }
      alta_hueco_ocupado: {
        Args: { p_fin: string; p_inicio: string; p_profesional_id: string }
        Returns: boolean
      }
      alta_paciente: {
        Args: {
          p_alergias?: string
          p_apellidos: string
          p_clave_version?: number
          p_dni_cifrado?: string
          p_dni_etiqueta?: string
          p_dni_indice?: string
          p_dni_nonce?: string
          p_domicilio_cifrado?: string
          p_domicilio_etiqueta?: string
          p_domicilio_nonce?: string
          p_fecha_nacimiento: string
          p_indice_clave_version?: number
          p_medicacion_actual?: string
          p_nombre: string
          p_sexo?: Database["public"]["Enums"]["sexo_administrativo"]
          p_telefono?: string
          p_tipo_documento?: string
        }
        Returns: string
      }
      alta_resolver_tipo: {
        Args: { p_duracion_minutos: number; p_tipo_terapia_id: string }
        Returns: number
      }
      anadir_version_borrador: {
        Args: {
          p_base_centimos: number
          p_borrador_id: string
          p_centro_id: string
          p_contenido_canonico: string
          p_creada_en: string
          p_cuota_centimos: number
          p_descartado: boolean
          p_destinatario_nombre: string
          p_lineas: Json
          p_nif_cifrado: string
          p_nif_etiqueta: string
          p_nif_nonce: string
          p_total_centimos: number
        }
        Returns: number
      }
      avanzar_cursor_sincronizacion: {
        Args: { p_hasta?: string }
        Returns: string
      }
      bloquear_historia: { Args: never; Returns: number }
      calcular_propuesta_de_evento: {
        Args: {
          p_carga: Json
          p_cita: Database["public"]["Tables"]["citas"]["Row"]
          p_tipo: string
        }
        Returns: {
          clasificacion: string
          fecha: string
          fin: string
          hora: string
          inicio: string
          zona: string
        }[]
      }
      canjear_codigo_recuperacion: {
        Args: never
        Returns: {
          bloqueado_hasta: string
          canjeado: boolean
          motivo: string
        }[]
      }
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
      cita_en_curso: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_cita"]
          p_fin: string
          p_inicio: string
        }
        Returns: boolean
      }
      cita_episodio_coherente: {
        Args: {
          p_episodio_id: string
          p_fecha: string
          p_paciente_id: string
          p_profesional_id: string
        }
        Returns: boolean
      }
      cita_episodio_unico: {
        Args: {
          p_fecha: string
          p_paciente_id: string
          p_profesional_id: string
        }
        Returns: string
      }
      citas_afectadas_por_regla: {
        Args: { p_desde_cita_id?: string; p_serie_id: string }
        Returns: {
          cita_id: string
        }[]
      }
      clave_de_cifrado: { Args: { p_nombre: string }; Returns: string }
      clave_proveedor_facturacion: { Args: never; Returns: string }
      cobertura_solo_adicion: {
        Args: never
        Returns: {
          capa1_revoke: boolean
          capa2_fila: boolean
          capa3_sentencia: boolean
          existe: boolean
          tabla: string
        }[]
      }
      cobros_asignables: {
        Args: { p_factura_espejo_id: string }
        Returns: {
          cobro_id: string
          fecha: string
          forma_pago: Database["public"]["Enums"]["forma_pago"]
          importe_centimos: number
          motivo: string
          referencia: string
        }[]
      }
      comprobar_codigo_recuperacion: {
        Args: { p_codigo: string }
        Returns: undefined
      }
      comprobar_contrasena_para_regenerar: {
        Args: { p_contrasena: string }
        Returns: undefined
      }
      comprobar_pin_historia: { Args: { p_pin: string }; Returns: undefined }
      crear_borrador: {
        Args: {
          p_base_centimos: number
          p_borrador_id: string
          p_centro_id: string
          p_contenido_canonico: string
          p_creada_en: string
          p_cuota_centimos: number
          p_destinatario_nombre: string
          p_lineas: Json
          p_nif_cifrado: string
          p_nif_etiqueta: string
          p_nif_nonce: string
          p_paciente_id: string
          p_profesional_id: string
          p_total_centimos: number
        }
        Returns: number
      }
      dar_alta_centro: {
        Args: { p_centro_id: string; p_perfil_id: string }
        Returns: string
      }
      dar_de_baja_perfil: {
        Args: { p_motivo?: string; p_perfil_id: string }
        Returns: {
          desbloqueos_revocados: number
          pin_borrado: boolean
        }[]
      }
      desbloquear_historia: {
        Args: never
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
      disparar_drenado_facturacion: { Args: never; Returns: undefined }
      documentos_para_sincronizar: {
        Args: {
          p_ids?: string[]
          p_limite?: number
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
        }
        Returns: {
          anotaciones: Database["public"]["Enums"]["anotacion_documento_proveedor"][]
          proveedor_documento_id: string
          tiene_espejo: boolean
        }[]
      }
      encolar_envio_borrador: {
        Args: { p_borrador_id: string }
        Returns: string
      }
      enesimo_dia_del_mes: {
        Args: { p_dia_semana: number; p_mes: string; p_ordinal: number }
        Returns: string
      }
      episodio_para_nota: {
        Args: {
          p_centro_id?: string
          p_cita_id?: string
          p_episodio_id?: string
          p_paciente_id: string
        }
        Returns: string
      }
      es_profesional_asignado: {
        Args: { p_paciente_id: string }
        Returns: boolean
      }
      es_profesional_del_episodio: {
        Args: { p_episodio_id: string }
        Returns: boolean
      }
      es_zona_iana: { Args: { p_zona: string }; Returns: boolean }
      escalar_notas_pendientes: { Args: never; Returns: number }
      esta_en_curso: { Args: { p_cita_id: string }; Returns: boolean }
      estado_clave_proveedor_facturacion: {
        Args: never
        Returns: {
          actualizado_en: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          ultimos4: string
        }[]
      }
      estado_cola_borrador: { Args: { p_borrador_id: string }; Returns: string }
      estado_de_cuenta: {
        Args: never
        Returns: {
          desbloqueo_caduca_en: string
          estado: Database["public"]["Enums"]["estado_perfil"]
          requiere_pin: boolean
          rol: Database["public"]["Enums"]["rol_usuario"]
          tiene_pin: boolean
        }[]
      }
      etiqueta_motivo_exportacion: {
        Args: { m: Database["public"]["Enums"]["motivo_exportacion"] }
        Returns: string
      }
      evaluar_registro_postgres: { Args: { p_ajustes: Json }; Returns: boolean }
      exportar_nota: {
        Args: {
          p_agente?: string
          p_ip?: unknown
          p_motivo?: Database["public"]["Enums"]["motivo_exportacion"]
          p_nota_id: string
          p_paciente_id: string
          p_referencia?: string
        }
        Returns: Json
      }
      fecha_en_regla_nueva: {
        Args: {
          p_dia_semana: number
          p_fecha_cita: string
          p_fecha_destino?: string
          p_fecha_origen?: string
          p_ordinal?: number
          p_periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
        }
        Returns: string
      }
      fijar_pin_historia: { Args: { p_pin: string }; Returns: undefined }
      fn_comprobar_devolucion_en_factura: {
        Args: { p_factura_espejo_id: string; p_importe: number }
        Returns: undefined
      }
      generar_codigos_recuperacion: { Args: never; Returns: string[] }
      guardar_clave_proveedor_facturacion: {
        Args: {
          p_clave: string
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
        }
        Returns: undefined
      }
      historia_desbloqueada: { Args: never; Returns: boolean }
      leer_identificacion: {
        Args: { p_paciente_id: string }
        Returns: {
          dni_cifrado: string
          dni_clave_version: number
          dni_etiqueta: string
          dni_nonce: string
          domicilio_cifrado: string
          domicilio_clave_version: number
          domicilio_etiqueta: string
          domicilio_nonce: string
          tipo_documento: string
        }[]
      }
      listado_facturas_espejo: {
        Args: {
          p_desde: string
          p_desplazamiento?: number
          p_forma_pago?: Database["public"]["Enums"]["forma_pago"]
          p_hasta: string
          p_limite?: number
          p_profesional_id?: string
        }
        Returns: {
          cobros: Json
          cobros_sin_factura: number
          fecha_expedicion: string
          id: string
          numero: string
          paciente_apellidos: string
          paciente_fusionado: boolean
          paciente_id: string
          paciente_nombre: string
          proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          total_centimos: number
          total_filas: number
          url_proveedor: string
        }[]
      }
      nivel_nota_pendiente: {
        Args: { p_centro: string; p_referencia: string }
        Returns: number
      }
      nota_tiene_version_conjunta: {
        Args: { p_nota_id: string }
        Returns: boolean
      }
      notas_para_copia: {
        Args: { p_paciente_id: string }
        Returns: {
          autor_nombre: string
          fecha_sesion: string
          nota_id: string
          versiones: number
        }[]
      }
      notificar_discrepancia_facturacion: {
        Args: {
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          p_proveedor_documento_id: string
        }
        Returns: undefined
      }
      ocurrencias_serie: {
        Args: {
          p_desde: string
          p_dia_semana: number
          p_fin_el: string
          p_periodicidad: Database["public"]["Enums"]["periodicidad_serie"]
          p_sesiones: number
        }
        Returns: string[]
      }
      plan_alta_serie: {
        Args: {
          p_centro_id: string
          p_duracion_minutos: number
          p_fechas: string[]
          p_hora_local: string
          p_profesional_id: string
          p_zona_horaria: string
        }
        Returns: Json
      }
      plan_edicion_serie: {
        Args: {
          p_cita: Database["public"]["Tables"]["citas"]["Row"]
          p_dia_semana: number
          p_duracion_minutos: number
          p_fecha: string
          p_hora_local: string
          p_serie: Database["public"]["Tables"]["series_cita"]["Row"]
          p_zona_horaria: string
        }
        Returns: Json
      }
      preparar_invitacion: {
        Args: {
          p_centro_id: string
          p_rol: Database["public"]["Enums"]["rol_usuario"]
        }
        Returns: undefined
      }
      profesionales_del_pendiente: {
        Args: never
        Returns: {
          id: string
          nombre_completo: string
        }[]
      }
      prolongar_desbloqueo: { Args: never; Returns: string }
      proveedor_facturacion_activo: {
        Args: never
        Returns: Database["public"]["Enums"]["proveedor_facturacion"]
      }
      quitar_proveedor_facturacion: { Args: never; Returns: undefined }
      reclamar_envios_facturacion: {
        Args: { p_limite?: number }
        Returns: {
          borrador_id: string
          destinatario_nif_cifrado: string
          destinatario_nif_clave_version: number
          destinatario_nif_etiqueta: string
          destinatario_nif_nonce: string
          destinatario_nombre: string
          evento_id: string
          fecha_documento: string
          lineas: Json
          numero_version: number
          version_id: string
          ya_enviado_documento_id: string
        }[]
      }
      recuento_notas_pendientes: {
        Args: never
        Returns: {
          nivel1: number
          nivel2: number
          nivel3: number
        }[]
      }
      regenerar_codigos_recuperacion: {
        Args: never
        Returns: {
          bloqueado_hasta: string
          codigos: string[]
          motivo: string
        }[]
      }
      registrar_acceso_historia: {
        Args: {
          p_agente?: string
          p_ip?: unknown
          p_paciente_id: string
          p_pestana: Database["public"]["Enums"]["pestana_historia"]
        }
        Returns: {
          acceso_id: number
          apertura: boolean
          vistas: number
        }[]
      }
      registrar_anotacion_documento: {
        Args: {
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          p_proveedor_documento_id: string
          p_tipo: Database["public"]["Enums"]["anotacion_documento_proveedor"]
        }
        Returns: string
      }
      registrar_envio_borrador: {
        Args: {
          p_documento_id: string
          p_evento_id: string
          p_fecha_documento: string
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          p_proyeccion_version: number
          p_version_id: string
        }
        Returns: string
      }
      registrar_evento_auditable: {
        Args: {
          p_detalle?: Json
          p_operacion: string
          p_registro_id: string
          p_tabla: string
        }
        Returns: undefined
      }
      registrar_factura_espejo: {
        Args: {
          p_base_centimos: number
          p_cuota_iva_centimos: number
          p_fecha_expedicion: string
          p_numero: string
          p_proveedor: Database["public"]["Enums"]["proveedor_facturacion"]
          p_proveedor_documento_id: string
          p_total_centimos: number
          p_url_proveedor: string
        }
        Returns: string
      }
      registrar_fallo_envio_facturacion: {
        Args: { p_codigo: string; p_evento_id: string; p_permanente: boolean }
        Returns: undefined
      }
      registrar_fichero_exportado: {
        Args: { p_exportacion_id: string; p_huella_hex: string }
        Returns: undefined
      }
      registrar_invitacion: {
        Args: { p_perfil_id: string }
        Returns: undefined
      }
      registrar_reposicion_totp: {
        Args: { p_perfil_id: string }
        Returns: undefined
      }
      registro_postgres_seguro: { Args: never; Returns: boolean }
      rellenar_episodio_de_citas: { Args: never; Returns: Json }
      resolver_hora_local: {
        Args: { p_local: string; p_zona: string }
        Returns: {
          clasificacion: string
          instante: string
        }[]
      }
      resumen_pendiente: {
        Args: { p_profesional_id?: string }
        Returns: {
          filas: number
          pacientes_cobrado_de_mas: number
          pacientes_con_pendiente: number
          pendiente_total_centimos: number
        }[]
      }
      retencion_efectiva: {
        Args: { p_centro_id: string }
        Returns: {
          anios_historia_clinica: number
          anios_minimo_legal: number
          origen: string
        }[]
      }
      retirar_alta_centro: {
        Args: { p_centro_id: string; p_perfil_id: string }
        Returns: undefined
      }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
      segundo_factor_verificado_recientemente: {
        Args: { p_minutos?: number }
        Returns: boolean
      }
      umbrales_escalado: {
        Args: { p_centro: string }
        Returns: {
          nivel2_horas: number
          nivel3_horas: number
        }[]
      }
      verificar_cadena_borrador: {
        Args: { p_borrador_id?: string }
        Returns: {
          borrador_id: string
          creada_en: string
          motivo: string
          numero_version: number
          version_id: string
        }[]
      }
      verificar_cadena_huellas: {
        Args: { p_paciente_id?: string }
        Returns: {
          creada_en: string
          motivo: string
          nota_id: string
          paciente_id: string
          posicion_cadena: number
          version_id: string
        }[]
      }
      zona_horaria_centro: { Args: { p_centro_id: string }; Returns: string }
    }
    Enums: {
      alcance_cambio_serie: "esta" | "esta_y_siguientes"
      alcance_nota: "individual" | "conjunta"
      alcance_representacion: "patria_potestad" | "custodia" | "solo_contacto"
      anotacion_documento_proveedor:
        | "borrado_sin_aprobar"
        | "rectificado"
        | "anulado"
      estado_cita:
        | "programada"
        | "confirmada"
        | "realizada"
        | "cancelada"
        | "no_asistida"
      estado_evento_saliente: "pendiente" | "entregado" | "fallido"
      estado_perfil: "activo" | "suspendido" | "baja"
      estado_propuesta_cita: "pendiente" | "confirmada" | "descartada"
      forma_pago: "efectivo" | "transferencia" | "tarjeta" | "bizum" | "otro"
      modalidad_asistencia: "presencial" | "online"
      modalidad_relacional: "individual" | "pareja" | "familiar" | "grupo"
      motivo_desviacion_cita:
        | "reprogramada"
        | "anomalia_horaria"
        | "festivo"
        | "ausencia"
      motivo_exportacion:
        | "peticion_paciente"
        | "requerimiento_judicial_o_inspeccion"
        | "traspaso_caso"
      motivo_propuesta_cita:
        | "festivo"
        | "ausencia"
        | "ocupada"
        | "zona_cambiada"
        | "regla_cambiada"
      nivel_riesgo: "bajo" | "moderado" | "alto"
      periodicidad_serie: "semanal" | "quincenal" | "mensual"
      pestana_historia:
        | "historial_clinico"
        | "notas_clinicas"
        | "evaluaciones"
        | "informes"
        | "documentos"
      proveedor_facturacion: "holded"
      proyeccion_exportacion: "profesional" | "paciente"
      regimen_iva: "exento_sanitario" | "general"
      rol_usuario:
        | "administrador"
        | "profesional_sanitario"
        | "tecnico_administrativo"
      sexo_administrativo: "hombre" | "mujer" | "otro"
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
      tipo_disponibilidad: "franja" | "ausencia" | "festivo"
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
      alcance_cambio_serie: ["esta", "esta_y_siguientes"],
      alcance_nota: ["individual", "conjunta"],
      alcance_representacion: ["patria_potestad", "custodia", "solo_contacto"],
      anotacion_documento_proveedor: [
        "borrado_sin_aprobar",
        "rectificado",
        "anulado",
      ],
      estado_cita: [
        "programada",
        "confirmada",
        "realizada",
        "cancelada",
        "no_asistida",
      ],
      estado_evento_saliente: ["pendiente", "entregado", "fallido"],
      estado_perfil: ["activo", "suspendido", "baja"],
      estado_propuesta_cita: ["pendiente", "confirmada", "descartada"],
      forma_pago: ["efectivo", "transferencia", "tarjeta", "bizum", "otro"],
      modalidad_asistencia: ["presencial", "online"],
      modalidad_relacional: ["individual", "pareja", "familiar", "grupo"],
      motivo_desviacion_cita: [
        "reprogramada",
        "anomalia_horaria",
        "festivo",
        "ausencia",
      ],
      motivo_exportacion: [
        "peticion_paciente",
        "requerimiento_judicial_o_inspeccion",
        "traspaso_caso",
      ],
      motivo_propuesta_cita: [
        "festivo",
        "ausencia",
        "ocupada",
        "zona_cambiada",
        "regla_cambiada",
      ],
      nivel_riesgo: ["bajo", "moderado", "alto"],
      periodicidad_serie: ["semanal", "quincenal", "mensual"],
      pestana_historia: [
        "historial_clinico",
        "notas_clinicas",
        "evaluaciones",
        "informes",
        "documentos",
      ],
      proveedor_facturacion: ["holded"],
      proyeccion_exportacion: ["profesional", "paciente"],
      regimen_iva: ["exento_sanitario", "general"],
      rol_usuario: [
        "administrador",
        "profesional_sanitario",
        "tecnico_administrativo",
      ],
      sexo_administrativo: ["hombre", "mujer", "otro"],
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
      tipo_disponibilidad: ["franja", "ausencia", "festivo"],
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

