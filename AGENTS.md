# TGA AI Sales Commander

Este proyecto interpreta pedidos de prospección en español y los ejecuta por pasos. La ejecución es una máquina de estados guardada en SQLite.

## Reglas

- Lo que el usuario nombra reemplaza la configuración. Lo que no nombra queda en el valor predeterminado.
- Mostrá los filtros interpretados antes de la primera ejecución de esa instrucción.
- Una plantilla aprobada puede iniciar sola una instrucción igual más adelante.
- Una instrucción nueva, mientras hay una campaña en curso, entra en la cola y espera a que termine la anterior.
- No abras sesión de LinkedIn, no guardes contraseñas, no resuelvas CAPTCHA ni evadas una verificación de seguridad. Si aparece, la campaña se detiene.
- No pulses Surfe ni declares una importación exitosa sin evidencia observable y sin la verificación de HubSpot.
- Los duplicados se registran como omitidos, no como contactos nuevos.
- Si no hay suficientes resultados, el reporte dice cuántos se consiguieron.
- No inventes contactos, empresas ni IDs de HubSpot.
- `.cursor/mcp.json` se mantiene con `npx @playwright/mcp@latest --extension`.
- Una sola `OPENAI_API_KEY` en `.env`. Prospección la usa desde `shared/openai_client.py`.
- El modelo de prospección está en `config.py`. Cambiar el modelo no cambia la clave ni la facturación.
- `.env` queda en `.gitignore`. No se pega ninguna clave en el chat ni en el código.
