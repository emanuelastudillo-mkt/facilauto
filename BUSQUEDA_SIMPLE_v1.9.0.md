# FACIL AUTO v1.9.0 · Búsqueda simple

Preparado el 6 de noviembre de 2026, sobre v1.8.0 con datos de noviembre.
Entrega local lista para publicar; no se modificó la web en producción.

## Experiencia de uso

- Un solo buscador para marca y modelo. Acepta también el año, por ejemplo
  «VW Gol Trend 2018», «Hilux 2019» o «Peugeot 2008 2018».
- Reconoce modelos numéricos como Peugeot 2008 sin confundirlos con un año.
- Admite acentos, abreviaturas VW/MB y un error pequeño de escritura por palabra.
- Orden: modelo → año → versión. Solo muestra versiones disponibles para el año.
- Lista corta con referencias de mercado; botón para desplegar todas las
  variantes adicionales. Si el filtro solo coincide con referencias oficiales,
  esas coincidencias aparecen directamente.
- Filtro por texto dentro de las versiones. Nombres más legibles: «5 puertas»,
  «doble cabina», «manual» y «automática», cuando la fuente lo especifica.
- Navegación con flechas, Enter y Escape; opciones visibles en celular.
- Conserva la selección al recargar o volver al formulario. Cambiar modelo o
  año invalida las selecciones incompatibles y oculta el resultado anterior.
- La selección manual por marca permanece disponible.

Ejemplo: Gol Trend tiene 66 referencias en el catálogo. Elegir 2018 limita la
lista a 18; la vista corta presenta las nueve de mercado. Buscar «Trendline»
muestra dos referencias de mercado y permite abrir una adicional oficial.

## Datos y mantenimiento

Se conservan las 15.735 referencias públicas, los identificadores originales,
los precios de noviembre y todo el historial. La agrupación visual une seis
diferencias de escritura del nombre del modelo, sin mezclar versiones o valores.
Las fórmulas de cotización, financiación y transferencia no cambian.

El índice de búsqueda se construye en el navegador a partir del catálogo
central ya cargado. No requiere mantener una lista adicional cada mes,
servicios externos, consultas al administrador ni migraciones D1.
La home y las subpáginas utilizan la misma calculadora y reciben esta mejora
sin editar cada página por separado.

## Publicar

Si ya está instalada v1.8.0, subir el contenido del ZIP incremental a la raíz
del repositorio, reemplazando los archivos del mismo nombre y conservando las
carpetas. El ZIP completo contiene la carpeta `facilauto-main`; subir su contenido
a la raíz si se necesita instalar la versión completa con los datos de noviembre.

Esperar el despliegue de GitHub Pages y comprobar v1.9.0 en el pie de página.
No se deben eliminar los demás archivos del repositorio.

## Comprobaciones

- Todos los identificadores públicos permanecen disponibles una sola vez en
  el índice: 15.735 referencias agrupadas en 1.419 nombres de modelo.
- Búsqueda de modelos numéricos, errores pequeños, acentos, abreviaturas,
  modelos distintos y ausencia de resultados.
- Diez cotizaciones comparadas con v1.8.0: mismos valores, costos e historial.
- Los siete archivos de datos del motor conservan exactamente el contenido
  de v1.8.0. Solo cambia la versión pública de `site_meta.json`.
- Pruebas de selección, cambio de año, filtros, teclado y recuperación del
  borrador en navegador; revisión de escritorio y celular.

La prueba de cotización usa un servicio de autorización simulado localmente;
no consume consultas reales. La autenticación en producción requiere una
comprobación posterior al despliegue.
