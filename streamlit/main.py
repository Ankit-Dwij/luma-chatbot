# app.py
import streamlit as st
import requests

st.set_page_config(page_title="Luma Chatbot", page_icon="🤖")

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

# Display all previous messages
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# Chat input
user_input = st.chat_input("Type your question here...")

if user_input:
    # Add user message to history and display it
    st.session_state.messages.append({"role": "user", "content": user_input})
    with st.chat_message("user"):
        st.write(user_input)
    
    # Get bot response from API
    with st.spinner("Thinking..."):
        api_response = call_rag_api(user_input, st.session_state.conversation_id)
    
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

# Sidebar options
with st.sidebar:
    st.subheader("Chat Info")
    st.write(f"💬 Messages: {len(st.session_state.messages)}")
    if st.session_state.conversation_id:
        st.write(f"🔗 Conversation ID: {st.session_state.conversation_id[:8]}...")
    
    if st.button("Clear Chat History"):
        st.session_state.messages = []
        st.session_state.conversation_id = None
        st.rerun()
    
    st.divider()
    st.subheader("API Settings")
    st.text(f"API: {API_URL}")