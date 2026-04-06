import os
import pandas as pd
from langchain_community.document_loaders import (
    PyPDFLoader, 
    Docx2txtLoader, 
    TextLoader, 
    UnstructuredFileLoader,
    BSHTMLLoader,  
    CSVLoader     
)
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import HuggingFaceEmbeddings

def cargar_documentos(ruta_carpeta = '/Users/lauracalleja/Documents/AI/tfg/tfg_chatbot/venv/mis_archivos_historicos'):
    documentos_totales = []
    for archivo in os.listdir(ruta_carpeta):
        ruta_completa = os.path.join(ruta_carpeta, archivo)
        if archivo.startswith('.'): continue 
        
        try:
            if archivo.endswith(".pdf"):
                loader = PyPDFLoader(ruta_completa)
            elif archivo.endswith(".docx"):
                loader = Docx2txtLoader(ruta_completa)
            elif archivo.endswith(".txt"):
                loader = TextLoader(ruta_completa, encoding='utf-8')
            elif archivo.endswith(".html") or archivo.endswith(".htm"):
                loader = BSHTMLLoader(ruta_completa)
            elif archivo.endswith(".csv"):
                # El CSVLoader tratará cada fila como un documento separado
                loader = CSVLoader(ruta_completa, encoding='utf-8')
            else:
                loader = UnstructuredFileLoader(ruta_completa)
            
            documentos_totales.extend(loader.load())
            print(f"✅ Cargado: {archivo}")
        except Exception as e:
            print(f"❌ Error con {archivo}: {e}")
            
    return documentos_totales


# --- EJECUCIÓN ---
path_datos = "./mis_archivos_historicos"
docs = cargar_documentos(path_datos)

if len(docs) == 0:
    print("❌ ERROR: No se encontró ningún documento en la carpeta. ¡Añade archivos!")
else:
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
    chunks = text_splitter.split_documents(docs)
    
    if len(chunks) == 0:
        print("❌ ERROR: Los documentos están vacíos o no se pudieron fragmentar.")
    else:
        print(f"✅ Tenemos {len(chunks)} fragmentos. Empezando a crear la base de datos...")
        embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
        
        vector_db = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory="./chroma_db"
        )
        print(f"¡Hecho! Base de datos creada con éxito.")
#-----------------

# Crea la carpeta si no existe y mete ahí tus archivos
path_datos = "./mis_archivos_historicos"
if not os.path.exists(path_datos):
    os.makedirs(path_datos)

print("Cargando documentos...")
docs = cargar_documentos(path_datos)

# 2. Fragmentación (Chunking)
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=150)
chunks = text_splitter.split_documents(docs)

# 3. Creación de Embeddings y Base de Datos (Local y Gratuito)
# Usamos un modelo de HuggingFace que corre en tu Mac sin pagar APIs
print("Creando base de datos vectorial (esto puede tardar la primera vez)...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

vector_db = Chroma.from_documents(
    documents=chunks,
    embedding=embeddings,
    persist_directory="./chroma_db" # Se guardará en esta carpeta
)

print(f"¡Hecho! Has indexado {len(chunks)} fragmentos de historia.")
