# FACIL AUTO v1.9.0

Sitio de cotización vehicular con actualización mensual centralizada.

## Búsqueda simplificada

1. Escribir modelo, marca o ambos; también se puede incluir el año:
   `Corolla`, `VW Gol Trend 2018`, `Hilux 2019`.
2. Elegir el año si no se indicó en la búsqueda.
3. Confirmar la versión. La lista se limita al año elegido y permite filtrar
   por motor, caja o equipamiento. Los kilómetros son opcionales.

La lista corta prioriza versiones con referencia de mercado. El botón
«Ver todas las versiones» permite acceder a las referencias adicionales.
Cuando la búsqueda solo coincide con referencias oficiales, se muestran
directamente. Se mantienen las 15.735 referencias públicas y sus identidades.

La búsqueda tolera acentos, abreviaturas como VW/MB y pequeños errores de
escritura. Agrupa diferencias de escritura como S10 y S-10 Pick-Up sin
combinar sus precios ni cambiar las fórmulas. También conserva la elección
manual por marca y recupera el borrador de una consulta al regresar.

Publicación y comprobaciones: `BUSQUEDA_SIMPLE_v1.9.0.md`.

## Incluye

- Catálogo unificado: guía mensual + DNRPA.
- Valuación de mercado y estimación cuando falta un año exacto.
- Lectura de oportunidad con ajuste comercial de 10 p.p.
- Valuación DNRPA y transferencia estimada.
- Tasas bancarias y simulación de financiación.
- Herramientas de actualización de fuentes.
- Catálogo público simplificado: autos, SUVs, pick-ups y utilitarios livianos.
- Selectores con búsqueda por texto y filtro instantáneo.
- Buscador único de modelos con teclado y listas adaptadas a celulares.
- Pulso de valuaciones y versión centralizados en `data/site_meta.json`.
- Historial mensual desde agosto de 2026. El gráfico muestra las últimas tres
  guías disponibles (septiembre, octubre y noviembre en esta edición), cuando
  existe una referencia equivalente.

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
La home obtiene también sus cifras iniciales desde ese JSON: no requiere
reemplazar números ni meses en el HTML con cada nueva guía.

Antes de reemplazar el mes vigente, el proceso lo incorpora automáticamente a
`data/vehicle_history.json`. El historial usa la misma versión cuando está
disponible y recurre a comparables del mismo modelo cuando no hay coincidencia
literal. Nunca inventa un punto cuando no existe evidencia suficiente.

El proceso valida primero ambos PDF y restaura los JSON anteriores si alguna
etapa falla. Al finalizar informa exactamente qué archivos de datos deben
subirse a GitHub.

El importador reconoce también encabezados con fuentes codificadas y separa
las notas de moneda de las filas de precios. Si una nota no aclara la moneda
o contradice el formato del importe, excluye ese precio e informa el motivo en
`price_warnings` dentro de `data/vehicle_market.json`. Los demás años válidos
de la misma versión se conservan. En noviembre hay ocho importes de 0 km
pendientes de aclaración; el detalle está en `ACTUALIZACION_NOVIEMBRE_2026.md`.

## Publicación

Copiá el contenido manteniendo la estructura de directorios.
Las valuaciones se leen de los JSON publicados: no hace falta ejecutar
la migración a D1 desde el panel de administrador.
La página debe servirse por HTTP/HTTPS. No funciona abriendo `index.html` directamente con `file://`, porque los navegadores bloquean la lectura de los JSON locales.

## Diagnóstico de carga

Desde v0.05 el cargador informa qué archivo falta o devuelve error, en lugar de dejar el selector en “Cargando marcas…”. También evita caché durante la carga de las bases para reducir problemas después de una actualización.

## Prueba local

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000/`.

Pruebas del buscador y conservación de referencias:

```bash
node tools/test_vehicle_search.cjs
```
