import os
from langchain_community.vectorstores import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_ollama import ChatOllama
from langchain.chains import RetrievalQA
from langchain.prompts import PromptTemplate

# 1. Cargar la base de datos que ya creamos en el paso anterior
print("Cargando memoria histórica...")
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
vector_db = Chroma(persist_directory="./chroma_db", embedding_function=embeddings)

# 2. Configurar Ollama como el "Cerebro"
llm = ChatOllama(model="llama3", temperature=0.5)

# 3. Definir la personalidad (System Prompt)
template = """
Eres San Juan Bosco, padre y maestro de la juventud. 
Tu misión es responder a los jóvenes con cercanía, sabiduría y amor paternal.

Instrucciones:
1. Usa el CONTEXTO proporcionado de tus escritos para responder.
2. Si la respuesta no está en el contexto, usa tu filosofía de vida (el Sistema Preventivo: razón, religión y amor).
3. Habla siempre en primera persona y en español.
4. Tu tono debe ser optimista y educativo.

CONTEXTO DE TUS ARCHIVOS:
{context}

PREGUNTA DEL JOVEN: {question}
RESPUESTA DE DON BOSCO:"""

PROMPT = PromptTemplate(template=template, input_variables=["context", "question"])

# 4. Configurar la cadena de búsqueda y respuesta
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=vector_db.as_retriever(search_kwargs={"k": 3}), # Busca los 3 fragmentos más parecidos
    return_source_documents=True,
    chain_type_kwargs={"prompt": PROMPT}
)

# 5. Interfaz de Chat
print("\n**************************************************")
print("Sacerdote: ¡Hola, hijo mío! Soy Juan Bosco. ¿Qué hay en tu corazón?")
print("(Escribe 'salir' para terminar)")
print("**************************************************\n")

while True:
    pregunta = input("Tú: ")
    if pregunta.lower() in ["salir", "exit", "adiós", "adios"]:
        print("Don Bosco: ¡Dios te bendiga! Nos vemos en el Oratorio.")
        break
    
    # Obtener respuesta
    resultado = qa_chain.invoke({"query": pregunta})
    
    print(f"\nDon Bosco: {resultado['result']}\n")
    
    # Opcional: mostrar de qué archivo sacó la info (muy útil para el TFG)
    # source = resultado["source_documents"][0].metadata['source']
    # print(f"[Fuente: {os.path.basename(source)}]")