# Administración de accesos

No existen cuentas iniciales automáticas. Las contraseñas de demostración publicadas están bloqueadas, incluso si sus registros todavía existen en la base de datos. Las sesiones anteriores al endurecimiento de septiembre de 2026 no se aceptan.

Para crear una cuenta del personal o restablecer su acceso, desde una terminal de confianza con DATABASE_URL configurada de forma privada:

    node scripts/set-staff-account.js nombre-usuario admin

Usar staff para una cuenta sin privilegios administrativos. El comando crea la cuenta o cambia su contraseña y rol si ya existe. Solicita la contraseña sin mostrarla; usar una contraseña única generada por un gestor. No enviar contraseñas por chat, incluirlas en argumentos ni guardarlas en Git. La contraseña se deriva con scrypt y un salt aleatorio. El cambio invalida las sesiones previas de esa cuenta.

Las cuentas existentes con contraseña propia conservan acceso. Los roles y el estado de las credenciales se consultan en la base en cada solicitud privada. Un cambio de rol se aplica a las sesiones existentes. Configurar SESSION_SECRET con un secreto aleatorio privado; sin él se conserva temporalmente la compatibilidad con DATABASE_URL. No hay respaldo público de desarrollo. Cambiar el secreto de firma invalida también los enlaces firmados de boletos: coordinar su reemisión antes de rotarlo.

Las consultas y registros de compras exigen el enlace firmado de la orden, además del identificador de pago. Para un comprador que perdió el enlace, comprobar su identidad y compra por un canal privado antes de reemitirlo. Nunca sustituirlo por un enlace público basado solo en el número de pago.

La revisión y las pruebas de código no acreditan que haya ocurrido o no una intrusión. Para investigarla se necesitan los registros de acceso del proveedor y la base de datos, con el mínimo acceso a datos personales. Este cambio no borra cuentas, reservas ni compras.
