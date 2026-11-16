import { useCallback, useEffect, useMemo, useState } from 'react';
import { historicalDocuments, historicalDownload, historicalUpload, historicalDelete, historicalIndex } from './api/historical.js';

const panel = { background: 'rgba(25,25,45,0.9)', border: '1px solid #28295E', borderRadius: 30, padding: 'clamp(20px, 4vw, 42px)', maxWidth: 1100, margin: '0 auto 40px' };
const control = { background: '#111', border: '1px solid #777', borderRadius: 12, color: '#fff', padding: 12, boxSizing: 'border-box', maxWidth: '100%' };
const button = { border: 0, background: '#E6D7AA', color: '#161616', borderRadius: 22, padding: '13px 22px', cursor: 'pointer', fontWeight: 800 };
const heading = { color: '#E6D7AA', marginTop: 0, borderLeft: '6px solid #E6D7AA', paddingLeft: 18, fontSize: 'clamp(1.7rem, 4vw, 2.3rem)' };
const fileLimit = 350 * 1024 * 1024;
const CAN_DELETE = import.meta.env.VITE_ARCHIVE_DOCUMENT_DELETE === 'true';
const CAN_INDEX = import.meta.env.VITE_ARCHIVE_MANUAL_INDEX === 'true';

function sizeLabel(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function HistoricalManagement() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const visible = useMemo(() => documents.filter((doc) => (
    doc.filename.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es'))
  )), [documents, query]);

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
    setError('');
    setMessage('');
    try {
      await historicalDelete(filename);
      await refresh();
      setMessage('Documento eliminado del directorio y del índice de búsqueda.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const index = async (filename) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await historicalIndex(filename);
      setMessage(response.message);
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
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
      <label htmlFor="historical-filter" style={{ display: 'block', margin: '20px 0 10px' }}>Filtrar por nombre o año</label>
      <input id="historical-filter" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ej. 1954 o Don Bosco" style={{ ...control, width: '100%' }} />
      {loading ? <p role="status">Consultando el archivo…</p> : null}
      {!loading && !visible.length ? <p>No hay PDF que coincidan con el filtro.</p> : null}
      <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
        {visible.map((doc) => (
          <article key={doc.filename} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#12121d', border: '1px solid #353554', borderRadius: 16, padding: 16 }}>
            <div style={{ minWidth: 200, flex: 1 }}>
              <strong style={{ overflowWrap: 'anywhere' }}>📄 {doc.filename}</strong>
              <div style={{ fontSize: 13, color: '#c7c7d6', marginTop: 8 }}>{sizeLabel(doc.sizeBytes)}{doc.year ? ` · ${doc.year}` : ''} · {doc.pages} páginas indexadas</div>
              <div style={{ color: doc.status === 'indexed' ? '#a4dfb4' : '#efcd80', marginTop: 5 }}>
                {doc.status === 'indexed' ? 'Indexado y disponible para búsqueda' : doc.status === 'stored' ? 'Almacenado · pendiente de catalogación' : 'Pendiente de indexación'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" disabled={busy} onClick={() => download(doc.filename)} style={button}>Descargar original</button>
              {CAN_INDEX && doc.status === 'pending' ? <button type="button" disabled={busy} onClick={() => index(doc.filename)} style={button}>Indexar PDF</button> : null}
              {CAN_DELETE ? <button type="button" disabled={busy} onClick={() => remove(doc.filename)} style={{ ...button, background: '#ff9797' }}>Eliminar PDF</button> : null}
            </div>
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
        <p style={{ fontSize: 13, opacity: 0.8 }}>El archivo se sube directamente al S3 privado. Las anualidades «Don Bosco en España_YYYY.pdf» se indexan automáticamente o pueden reintentarse mediante «Indexar PDF». Otros PDF quedan almacenados hasta completar su catalogación.</p>
      </form>


    </section>
  );
}
