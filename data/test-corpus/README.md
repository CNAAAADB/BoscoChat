# Don Bosco en España — fuentes públicas para pruebas

Se identificaron tres números públicos de la revista oficial de la Confederación: 766, 767 y 768 (2024). Los enlaces exactos y los periodos están en [dbe-public-sources.csv](dbe-public-sources.csv). La fuente general es https://confedebosco.es/revista-dbe/.

**Importante:** que un PDF pueda consultarse públicamente no garantiza permiso para redistribuirlo, indexarlo comercialmente ni publicarlo en GitHub. **No se incorporan binarios, OCR íntegro ni material protegido a Git.** El campo `license_status` queda como `redistribution_not_verified`; requiere validación con el titular de derechos antes de alojar copias en entornos compartidos o de producción.

Para pruebas locales autorizadas, ejecutar desde la raíz:

```bash
python3 scripts/fetch-dbe-test-corpus.py --authorized
```

Los ficheros irán a `data/test-corpus/local-pdfs/`, que debe permanecer ignorada por Git. El descargador comprueba código de respuesta, tipo PDF, cabecera y tamaño máximo de 30 MiB por número. **No es un pipeline de ingesta.** El buscador documental real depende todavía de BC-006 (almacenamiento seguro), BC-007 (OCR e indexación) y BC-008 (búsqueda); no se deben declarar funcionales hasta que haya pruebas extremo a extremo.

Cuando existan permisos y pipeline, probar búsquedas sobre textos comprobados de estos números, verificando publicación, número, página y concordancia del OCR con el PDF original. Registrar permisos, procedencia y checksum por fichero antes de importar.

## Índice de búsqueda local

Requiere Poppler `pdftotext` y Python con SQLite FTS5. **Solo para PDFs con uso autorizado**:

```bash
python3 scripts/fetch-dbe-test-corpus.py --authorized
python3 scripts/index-dbe-test-corpus.py build
python3 scripts/index-dbe-test-corpus.py search '"Don Bosco"'
python3 scripts/index-dbe-test-corpus.py smoke
```

Esto permite comprobar búsqueda por páginas y procedencia en un entorno local; **no conecta todavía la interfaz web**. Para una búsqueda integral en AWS todavía hacen falta BC-006, BC-007 y BC-008, junto con permisos de uso/hosting de estos ejemplares. La extracción depende de que los PDF contengan texto; si son imágenes sin capa de texto se necesita OCR. Las pruebas locales no se han ejecutado en este PR.
