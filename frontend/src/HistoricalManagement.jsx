import { useCallback, useEffect, useMemo, useState } from 'react';
import { historicalDocuments, historicalDownload, historicalUpload, historicalDelete, historicalIndex, historicalUnindex } from './api/historical.js';
import { ARCHIVE_PUBLICATIONS, filterHistoricalDocuments } from './archive-filters.js';

const panel = { background: 'rgba(25,25,45,0.9)', border: '1px solid #28295E', borderRadius: 30, padding: 'clamp(20px, 4vw, 42px)', maxWidth: 1100, margin: '0 auto 40px' };
const control = { background: '#111', border: '1px solid #777', borderRadius: 12, color: '#fff', padding: 12, boxSizing: 'border-box', maxWidth: '100%' };
const button = { border: 0, background: '#E6D7AA', color: '#161616', borderRadius: 22, padding: '13px 22px', cursor: 'pointer', fontWeight: 800 };
const heading = { color: '#E6D7AA', marginTop: 0, borderLeft: '6px solid #E6D7AA', paddingLeft: 18, fontSize: 'clamp(1.7rem, 4vw, 2.3rem)' };
const fileLimit = 350 * 1024 * 1024;
const CAN_DELETE = import.meta.env.VITE_ARCHIVE_DOCUMENT_DELETE === 'true';
const CAN_INDEX = import.meta.env.VITE_ARCHIVE_MANUAL_INDEX === 'true';
const CAN_UNINDEX = import.meta.env.VITE_ARCHIVE_UNINDEX === 'true';

function sizeLabel(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function HistoricalManagement() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [filterPublication, setFilterPublication] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [catalogFile, setCatalogFile] = useState(null);
  const [catalogPublication, setCatalogPublication] = useState('');
  const [catalogYear, setCatalogYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await historicalDocuments();
      setDocuments(response.documents ?? []);
      setError('');
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    historicalDocuments()
      .then(({ documents: records }) => setDocuments(records ?? []))
      .catch((failure) => setError(failure.message))
      .finally(() => setLoading(false));
  }, []);

  const availableYears = useMemo(() => [...new Set(documents.map((doc) => Number(doc.year))
    .filter((year) => Number.isInteger(year) && year >= 1800 && year <= 2100))]
    .sort((a, b) => b - a), [documents]);
  const visible = useMemo(() => filterHistoricalDocuments(documents, {
    query, publication: filterPublication, year: filterYear,
  }).filter((doc) => !filterMonth || doc.month === Number(filterMonth)), [documents, query, filterPublication, filterYear, filterMonth]);

  const upload = async (event) => {
    event.preventDefault();
    const uploadForm = event.currentTarget;
    setError('');
    setMessage('');
    if (!selectedFile) return setError('Selecciona un PDF.');
    if (selectedFile.size > fileLimit) return setError('El PDF supera el límite de 350 MB.');
    setBusy(true);
    try {
      const response = await historicalUpload(selectedFile, setMessage);
      setSelectedFile(null);
      uploadForm.reset();
      setMessage(response.willIndexAutomatically
        ? 'PDF guardado en AWS. La indexación automática está solicitada.'
        : 'PDF guardado en AWS y visible en el directorio. Pendiente de catalogación para buscar su contenido.');
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (filename) => {
    if (!window.confirm('¿Eliminar "' + filename + '" del almacenamiento y del índice de búsqueda? Esta acción retirará el PDF del directorio.')) return;
    setBusy(true);
    setActiveAction({ filename, label: 'Eliminando PDF y retirando su índice…' });
    setActionError(null);
    setActionSuccess(null);
    setError('');
    setMessage('');
    try {
      await historicalDelete(filename);
      await refresh();
      setMessage('Documento eliminado del directorio y del índice de búsqueda.');
    } catch (failure) { setError(failure.message); setActionError({ filename, message: failure.message }); }
    finally { setBusy(false); setActiveAction(null); }
  };

  const index = async (filename, catalog = null) => {
    setBusy(true);
    setActiveAction({ filename, label: 'Enviando solicitud de indexación…' });
    setActionError(null);
    setActionSuccess(null);
    setError('');
    setMessage('');
    try {
      const response = await historicalIndex(filename, catalog);
      setCatalogFile(null);
      setMessage(response.message);
      setActionSuccess({ filename, message: 'Solicitud aceptada. El documento seguirá pendiente hasta que el indexador termine; pulsa «Actualizar estado» más adelante.' });
      await refresh();
    } catch (failure) { setError(failure.message); setActionError({ filename, message: failure.message }); }
    finally { setBusy(false); setActiveAction(null); }
  };

  const unindex = async (filename) => {
    if (!window.confirm('¿Desindexar "' + filename + '"? El PDF original seguirá guardado, pero sus páginas ya no aparecerán en búsquedas.')) return;
    setBusy(true);
    setActiveAction({ filename, label: 'Retirando páginas del índice…' });
    setActionError(null);
    setActionSuccess(null);
    setError('');
    setMessage('');
    try {
      await historicalUnindex(filename);
      await refresh();
      setMessage('PDF desindexado. El original permanece almacenado y puede indexarse de nuevo.');
    } catch (failure) { setError(failure.message); setActionError({ filename, message: failure.message }); }
    finally { setBusy(false); setActiveAction(null); }
  };

  const download = async (filename) => {
    setError('');
    // Create the window during the user's click, before awaiting the authenticated request.
    const popup = window.open('about:blank', '_blank');
    if (popup) popup.opener = null;
    try {
      const response = await historicalDownload(filename);
      if (popup && !popup.closed) popup.location.replace(response.download.url);
      else window.location.assign(response.download.url);
    } catch (failure) {
      if (popup && !popup.closed) popup.close();
      setError(failure.message);
    }
  };

  return (
    <section style={panel}>
      <h2 style={heading}>Gestión histórica</h2>
      <p style={{ lineHeight: 1.6 }}>Directorio privado de documentos originales. Acceso para historiadores y administradores de la plataforma.</p>
      {error ? <p role="alert" style={{ background: '#471b1b', border: '1px solid #eb6868', borderRadius: 12, padding: 14 }}>{error}</p> : null}
      {message ? <p role="status" style={{ background: '#223527', borderRadius: 12, padding: 14 }}>{message}</p> : null}

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '20px 0' }}><a style={{ ...button, textDecoration: 'none' }} href="#historical-upload">+ Subir nuevo PDF</a></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ color: '#E6D7AA', margin: 0 }}>Archivos almacenados ({documents.length})</h3>
        <button type="button" onClick={refresh} disabled={loading || busy} style={button}>Actualizar estado</button>
      </div>
      <label htmlFor="historical-filter" style={{ display: 'block', margin: '20px 0 10px' }}>Buscar documento</label>
      <input id="historical-filter" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre del PDF o publicación" style={{ ...control, width: '100%' }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        <label style={{ display: 'grid', gap: 6, flex: '2 1 230px' }} htmlFor="historical-source-filter">Fuente
          <select id="historical-source-filter" value={filterPublication} onChange={(e) => setFilterPublication(e.target.value)} style={control}>
            {ARCHIVE_PUBLICATIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label>Mes <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} style={control}><option value="">Todos los meses</option>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select></label>
        <label style={{ display: 'grid', gap: 6, flex: '1 1 155px' }} htmlFor="historical-year-filter">Año
          <select id="historical-year-filter" value={filterYear} onChange={(e) => setFilterYear(e.target.value)} style={control}>
            <option value="">Todos los años</option>
            {availableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
          </select>
        </label>
      </div>
      {loading ? <p role="status">Consultando el archivo…</p> : null}
      {!loading && !visible.length ? <p>No hay PDF que coincidan con el filtro.</p> : null}
      <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        {visible.map((doc) => (
          <article key={doc.filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#12121d', border: '1px solid #353554', borderRadius: 16, padding: 16 }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <strong style={{ overflowWrap: 'anywhere' }}>📄 {doc.filename}</strong>
              <div style={{ fontSize: 13, color: '#c7c7d6', marginTop: 8 }}>{doc.publication ?? 'Publicación pendiente de catalogación'} · {sizeLabel(doc.sizeBytes)}{doc.year ? ` · ${doc.year}` : ''} · {doc.pages} páginas indexadas</div>
              <div style={{ color: doc.status === 'indexed' ? '#a4dfb4' : '#efcd80', marginTop: 5 }}>
                {doc.status === 'indexed' ? 'Indexado y disponible para búsqueda' : doc.status === 'stored' ? 'Almacenado · pendiente de catalogación' : 'Pendiente de indexación'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={busy} onClick={() => download(doc.filename)} style={button}>Descargar original</button>
              {CAN_INDEX && doc.status === 'pending' ? <button type="button" disabled={busy} onClick={() => index(doc.filename)} style={button}>Indexar PDF</button> : null}
              {CAN_INDEX && doc.status === 'stored' ? <button type="button" disabled={busy} onClick={() => {
                setCatalogFile(catalogFile === doc.filename ? null : doc.filename);
                setCatalogPublication(doc.publication ?? doc.filename.replace(/\.pdf$/i, ''));
                setCatalogYear(doc.year ? String(doc.year) : '');
              }} style={button}>Catalogar e indexar</button> : null}
              {CAN_UNINDEX && doc.status === 'indexed' ? <button type="button" disabled={busy} onClick={() => unindex(doc.filename)} style={button}>Desindexar PDF</button> : null}
              {CAN_DELETE ? <button type="button" disabled={busy} onClick={() => remove(doc.filename)} style={{ ...button, background: '#ff9797' }}>Eliminar PDF</button> : null}
            </div>
            {activeAction?.filename === doc.filename ? <p role="status" style={{ width: '100%', color: '#efcd80', margin: 0 }}>{activeAction.label}</p> : null}
            {actionError?.filename === doc.filename ? <p role="alert" style={{ width: '100%', color: '#ff9898', margin: 0 }}>Operación fallida: {actionError.message}</p> : null}
            {actionSuccess?.filename === doc.filename && doc.status !== 'indexed' ? <p role="status" style={{ width: '100%', color: '#a4dfb4', margin: 0 }}>{actionSuccess.message}</p> : null}
            {catalogFile === doc.filename && doc.status === 'stored' && CAN_INDEX ? (
              <form onSubmit={(event) => {
                event.preventDefault();
                index(doc.filename, { publication: catalogPublication.trim(), year: Number(catalogYear) });
              }} style={{ width: '100%', display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, borderTop: '1px solid #353554', paddingTop: 12 }}>
                <label style={{ display: 'grid', gap: 5, flex: '2 1 240px' }}>Publicación
                  <input type="text" maxLength={180} required value={catalogPublication} onChange={(event) => setCatalogPublication(event.target.value)} style={control} />
                </label>
                <label style={{ display: 'grid', gap: 5, flex: '1 1 130px' }}>Año
                  <input type="number" min={1800} max={2100} required value={catalogYear} onChange={(event) => setCatalogYear(event.target.value)} style={control} />
                </label>
                <button type="submit" disabled={busy || catalogPublication.trim().length < 2 || !catalogYear} style={button}>Solicitar indexación</button>
                <button type="button" disabled={busy} onClick={() => setCatalogFile(null)} style={button}>Cancelar</button>
              </form>
            ) : null}
          </article>
        ))}
      </div>
      <form id="historical-upload" onSubmit={upload} style={{ padding: 20, borderRadius: 20, background: '#11111e', margin: '26px 0' }}>
        <h3 style={{ color: '#E6D7AA', marginTop: 0 }}>Subir un nuevo PDF</h3>
        <p>Puedes subir un PDF de hasta 350 MB. Se guardará junto a los originales existentes y nunca sobrescribirá un archivo con el mismo nombre.</p>
        <label htmlFor="historical-pdf">Archivo PDF</label>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <input id="historical-pdf" type="file" accept=".pdf,application/pdf" disabled={busy} onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} style={{ ...control, flex: '1 1 300px' }} />
          <button type="submit" disabled={busy || !selectedFile} style={{ ...button, opacity: busy || !selectedFile ? 0.5 : 1 }}>{busy ? 'Subiendo…' : 'Subir PDF'}</button>
        </div>
        <p style={{ fontSize: 13, opacity: 0.8 }}>El archivo se sube directamente al S3 privado. Las anualidades «Don Bosco en España_YYYY.pdf» se indexan automáticamente o pueden reintentarse mediante «Indexar PDF». Otros PDF pueden catalogarse indicando publicación y año y solicitar su indexación manual.</p>
      </form>


    </section>
  );
}
