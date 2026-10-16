---
paths:
  - "scripts/rls/**"
---

# Banco de RLS — trampas de T-047

- Negativa de función: `assert_lanza_codigo_msg` con `function <nombre>`. Un 42501 de una función interna (`es_zona_iana`) enmascara el de la función probada. (T-047)
- Cada aserción nueva se mide con un mutante que la tumba, dentro de `begin … rollback` con `ON_ERROR_STOP=1`; el resultado va a `tickets/<T>/mutantes.json`. (T-047)
- Al cambiar la fijación de un módulo (perfiles o citas), se actualiza su cabecera en el mismo cambio. (T-047)
