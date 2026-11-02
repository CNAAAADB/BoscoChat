# Don Bosco en España — corpus privado autorizado para pruebas

El propietario del producto confirmó el 30 de octubre de 2026 que la Confederación posee estos PDF y autorizó su uso para pruebas de BoscoChat. La autorización se limita a pruebas del producto y **no autoriza publicación, redistribución pública ni incorporación de binarios a Git**. Los PDF, OCR e índices deben permanecer en almacenamiento privado conforme al SRS.

El catálogo [dbe-public-sources.csv](dbe-public-sources.csv) identifica los números 766, 767 y 768. Antes de descargar, una persona autorizada debe registrar el SHA-256 esperado de cada fuente. El descargador falla de forma cerrada si falta el hash, cambia el contenido, el host final tras una redirección no pertenece a la Confederación, la respuesta no es PDF o supera 30 MiB.

```bash
python3 scripts/fetch-dbe-test-corpus.py --authorized
python3 scripts/index-dbe-test-corpus.py build
python3 scripts/index-dbe-test-corpus.py search '"Don Bosco"'
python3 scripts/index-dbe-test-corpus.py smoke
```

Los ficheros se guardan en `data/test-corpus/local-pdfs/` y el índice en `data/test-corpus/local-index.sqlite3`; ambos están excluidos de Git. `pdftotext` se ejecuta sin shell, con timeout y límites de CPU, memoria, descriptores y tamaño de salida. Esto reduce el riesgo de PDF malicioso, pero no sustituye el aislamiento del pipeline productivo.

## Estado y trazabilidad

- Material de prueba para BC-006, BC-007 y BC-008; no demuestra que esas historias estén implementadas.
- La propuesta de almacenamiento está en `docs/proposals/BC-006-private-document-storage.md`.
- Pendiente antes de cualquier ingesta compartida: registrar hashes, aprobar las decisiones BC-006 indicadas en la propuesta y ejecutar pruebas de integración en AWS.
- Pendiente antes de merge: checks de los scripts y revisión independiente de seguridad/calidad sobre el SHA exacto.
