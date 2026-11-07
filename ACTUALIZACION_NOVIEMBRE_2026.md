# FACIL AUTO v1.8.0 · Datos noviembre de 2026

Preparado el 6 de noviembre de 2026. Actualización local lista para subir a
GitHub; no se publicó ni se modificó la base de usuarios del servidor.

## Datos incorporados

- Guía `Autos 01-11-2026.pdf`: 6.083 versiones con 18.074 precios utilizables.
- Tabla `01-11-2026.pdf`: 18.180 registros DNRPA, vigencia 01/11/2026.
- Catálogo público: 15.735 referencias de autos y utilitarios.
- Historial de agosto, septiembre y octubre conservado, con noviembre agregado.
  El gráfico utiliza las últimas tres guías: septiembre, octubre y noviembre.
  Cuando falta una referencia suficiente, indica que el historial está en formación.

El gráfico también verifica la moneda de origen de los precios anteriores
contra la referencia actual. Omite los puntos con moneda distinta para evitar
saltos artificiales causados por interpretaciones anteriores de las notas de
0 km. Los archivos históricos se conservan sin sobrescribir esos registros.
En 0 km se requiere una moneda actual confirmada para comparar otros meses.

La home muestra el análisis de la base actual: 17.697 precios comparables con
octubre y 9,8 % sin cambios. La comparación exige la misma marca, modelo,
versión, año y moneda; no representa ventas ni operaciones del mercado.
La cobertura incluye todas las referencias públicas del catálogo, mientras
que la comparación mensual utiliza los precios equivalentes de la guía.

## Ocho importes de 0 km pendientes de aclaración

No se usaron para cotizar porque la fuente no permite confirmar la moneda.
Se conserva el texto original en `data/vehicle_market.json`, campo
`price_warnings`, con la página y el motivo. Los números siguientes son
transcripciones del PDF, no importes convertidos.

| Vehículo | Cifra impresa | Página | Motivo |
| --- | --- | --- | --- |
| FOTON eVIEW CONNECT FURGON L1H1 ELECTRICO | 45,000 | 87 | La nota de 0 km no indica moneda. |
| FOTON eVIEW CONNECT FURGON L2H2 ELECTRICO | 49,500 | 87 | La nota de 0 km no indica moneda. |
| HYUNDAI HB20 5P 1,6 COMFORT PLUS | 28500,0 | 96 | La nota indica US$, pero la cifra usa el formato decimal de miles de pesos. |
| HYUNDAI HB20 5P 1,6 COMFORT PLUS AT | 32500,0 | 96 | Misma contradicción de moneda y formato. |
| HYUNDAI HB20 5P 1,6 PLATINUM SAFETY AT | 36500,0 | 96 | Misma contradicción de moneda y formato. |
| HYUNDAI HB20 SEDAN 4P 1,6 COMFORT PLUS | 28700,0 | 96 | Misma contradicción de moneda y formato. |
| HYUNDAI HB20 SEDAN 4P 1,6 PLATINUM SAFETY AT | 36000,0 | 96 | Misma contradicción de moneda y formato. |
| TOYOTA HIACE WAGON 2,8 TDi 6AT 10A 2024 | 111105,1 | 187 | Misma contradicción de moneda y formato. |

Las dos versiones FOTON quedan fuera de la guía utilizable porque no tienen
otro año con precio. Las otras seis conservan sus valores válidos de usados.
Una eventual estimación a partir de otros datos debe seguir mostrándose como
estimación, nunca como uno de estos precios omitidos.

## Cómo publicar

1. Si la web ya tiene v1.7.1 de octubre, descomprimir el ZIP incremental y
   subir su contenido a la raíz del repositorio respetando las carpetas.
2. Si no está instalada esa base, usar el ZIP completo: subir el contenido
   de su carpeta `facilauto-main` a la raíz del repositorio.
3. Esperar a que termine el despliegue de GitHub Pages y comprobar que la
   home indique noviembre de 2026 y el pie de página muestre v1.8.0.

No hace falta migrar datos a D1 desde el administrador ni editar cada subpágina.
Todas las herramientas comparten los JSON centrales. Se conservan las tasas,
el tipo de cambio predeterminado y los parámetros de transferencia anteriores:
estos dos PDF no aportan actualizaciones de esas variables.

## Verificación realizada

- Conciliación de las 18.082 celdas numéricas de la guía: 18.074 importadas
  y ocho documentadas como pendientes, sin celdas perdidas ni agregadas.
- Conservación exacta de los períodos históricos anteriores.
- Revisión de identidad de los registros DNRPA frente a octubre.
- Ocho cotizaciones locales con usados, 0 km en pesos y dólares, y una
  referencia exclusivamente DNRPA; verificación del historial y del rechazo
  de un año inválido. Sin consumo de consultas reales.
- Revisión en navegador de la home y de una subpágina compartiendo catálogo
  y versión. La autenticación y el servicio de créditos en producción no
  forman parte de esta prueba local.

## Próximos meses

```bash
python tools/update_monthly.py "Autos mes 2026.pdf" "dd-mm-2026.pdf" --version 1.8.1
```

El proceso valida las dos fuentes, incorpora el mes vigente al historial,
regenera catálogo y pulso, ejecuta los controles e informa qué cinco JSON
subir. Revisar cualquier aviso `REVISAR` antes de publicar nuevos importes.
