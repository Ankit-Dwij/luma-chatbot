# app.py
import streamlit as st
import requests

st.set_page_config(
    page_title="Devconnect Chatbot", 
    page_icon="🤖",
    layout="centered",
    initial_sidebar_state="expanded"
)

# Custom CSS for white theme
st.markdown("""
    <style>
    .stApp {
        background-color: white;
    }
    .sample-question {
        background-color: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 12px 16px;
        margin: 8px 0;
        cursor: pointer;
        transition: all 0.2s;
    }
    .sample-question:hover {
        background-color: #e9ecef;
        border-color: #dee2e6;
        transform: translateY(-2px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    </style>
""", unsafe_allow_html=True)

st.title("Luma Chatbot 🤖")
st.write("Ask me anything about events and guests!")

# API Configuration
API_URL = "https://tnimcwsknw.us-east-1.awsapprunner.com/rag/chat"

def call_rag_api(question, conversation_id=None):
    """Call the RAG API and return the response"""
    payload = {"question": question}
    if conversation_id:
        payload["conversationId"] = conversation_id
    
    try:
        response = requests.post(
            API_URL,
            headers={
                "accept": "application/json",
                "Content-Type": "application/json"
            },
            json=payload,
            timeout=30
        )
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        st.error(f"API Error: {str(e)}")
        return None

# Initialize session state for in-memory storage
if "messages" not in st.session_state:
    st.session_state.messages = []

if "conversation_id" not in st.session_state:
    st.session_state.conversation_id = None

# Sample questions
SAMPLE_QUESTIONS = [
    "🚀 Which events have the most founders and VCs?",
    "🌐 Where can I meet people from Arbitrum?",
    "💼 Which events feature companies that are hiring?",
    "🍻 Where can I grab a beer and network?"
]

# Show sample questions only if chat is empty
if len(st.session_state.messages) == 0:
    st.subheader("✨ Try asking:")
    cols = st.columns(2)
    for idx, question in enumerate(SAMPLE_QUESTIONS):
        col = cols[idx % 2]
        with col:
            if st.button(question, key=f"sample_{idx}", use_container_width=True):
                # Remove emoji prefix for the actual query
                clean_question = question.split(" ", 1)[1]
                st.session_state.messages.append({"role": "user", "content": clean_question})
                st.rerun()

# Display all previous messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# Process the last user message if it hasn't been processed
if st.session_state.messages and st.session_state.messages[-1]["role"] == "user":
    last_message = st.session_state.messages[-1]["content"]
    
    with st.spinner("Thinking..."):
        api_response = call_rag_api(last_message, st.session_state.conversation_id)
    
    if api_response:
        answer = api_response.get("answer", "Sorry, I couldn't generate a response.")
        conversation_id = api_response.get("conversationId")
        
        # Update conversation ID if provided
        if conversation_id:
            st.session_state.conversation_id = conversation_id
        
        # Add assistant message to history and display it
        st.session_state.messages.append({"role": "assistant", "content": answer})
        with st.chat_message("assistant"):
            st.write(answer)
    else:
        st.error("Failed to get response from the API. Please try again.")

# Chat input
user_input = st.chat_input("Type your question here...")

if user_input:
    # Add user message to history and display it
    st.session_state.messages.append({"role": "user", "content": user_input})
    st.rerun()

# Sidebar options
with st.sidebar:
    st.subheader("📊 Chat Info")
    st.write(f"💬 Messages: {len(st.session_state.messages)}")
    if st.session_state.conversation_id:
        st.write(f"🔗 Conversation ID: {st.session_state.conversation_id[:8]}...")
    
    if st.button("🗑️ Clear Chat History", use_container_width=True):
        st.session_state.messages = []
        st.session_state.conversation_id = None
        st.rerun()
        
    st.divider()
    st.subheader("💡 About")
    st.caption("This chatbot helps you discover events and connect with the right people in the events community.")