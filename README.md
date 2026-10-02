# FACIL AUTO v1.7.1

Sitio de cotización vehicular con actualización mensual centralizada.

## Incluye

- Catálogo unificado: guía mensual + DNRPA.
- Valuación de mercado y estimación cuando falta un año exacto.
- Lectura de oportunidad con ajuste comercial de 10 p.p.
- Valuación DNRPA y transferencia estimada.
- Tasas bancarias y simulación de financiación.
- Herramientas de actualización de fuentes.
- Catálogo público simplificado: autos, SUVs, pick-ups y utilitarios livianos.
- Selectores con búsqueda por texto y filtro instantáneo.
- Pulso de valuaciones y versión centralizados en `data/site_meta.json`.
- Historial mensual comparable del vehículo consultado, con valores de agosto,
  septiembre y octubre de 2026 cuando existe una referencia equivalente.

## Actualización mensual con 2 PDF

No hace falta modificar las subpáginas. El comando procesa las dos fuentes,
regenera el catálogo, actualiza el período visible y ejecuta las pruebas:

```bash
python tools/update_monthly.py "ruta/Autos mes 2026.pdf" "ruta/dd-mm-2026.pdf"
```

El pulso de la home se recalcula automáticamente desde la base actualizada:
cobertura pública, precios comparables contra el mes anterior y porcentaje de
valores sin cambios. Ya no depende de cargar manualmente cifras de ventas de un
informe externo que puede publicarse después que la guía de precios.

Antes de reemplazar el mes vigente, el proceso lo incorpora automáticamente a
`data/vehicle_history.json`. El historial usa la misma versión cuando está
disponible y recurre a comparables del mismo modelo cuando no hay coincidencia
literal. Nunca inventa un punto cuando no existe evidencia suficiente.

El proceso valida primero ambos PDF y restaura los JSON anteriores si alguna
etapa falla. Al finalizar informa exactamente qué archivos de datos deben
subirse a GitHub.

## Publicación

Copiá el contenido manteniendo la estructura de directorios.
La página debe servirse por HTTP/HTTPS. No funciona abriendo `index.html` directamente con `file://`, porque los navegadores bloquean la lectura de los JSON locales.

## Diagnóstico de carga

Desde v0.05 el cargador informa qué archivo falta o devuelve error, en lugar de dejar el selector en “Cargando marcas…”. También evita caché durante la carga de las bases para reducir problemas después de una actualización.

## Prueba local

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000/`.
