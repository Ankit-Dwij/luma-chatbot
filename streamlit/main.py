import streamlit as st
import requests

st.set_page_config(
    page_title="Devconnect Chatbot", 
    page_icon="🤖",
    layout="centered",
    initial_sidebar_state="expanded"    
)

# Custom CSS for light theme + hiding Streamlit elements + bottom banner
# Custom CSS for light theme + hiding Streamlit elements + bottom banner
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
    
    /* Hide Streamlit branding */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    header {visibility: hidden;}
    .stDeployButton {display: none;}
    
    /* Hide GitHub icon, Fork button, and profile picture */
    .viewerBadge_container__1QSob {display: none;}
    .styles_viewerBadge__1yB5_ {display: none;}
    section[data-testid="stToolbar"] {display: none;}
    button[kind="header"] {display: none;}
    
    /* Hide profile icon and avatar from bottom right */
    [data-testid="stHeader"] {display: none;}
    .stActionButton {display: none;}
    div[data-testid="stStatusWidget"] {display: none;}
    button[data-testid="baseButton-header"] {display: none;}
    
    /* Hide "Hosted with Streamlit" and all footer content */
    footer {display: none !important;}
    footer::after {
        content: none !important;
        display: none !important;
    }
    .reportview-container .main footer {display: none !important;}
    
    /* Custom bottom banner */
    .bottom-banner {
        position: fixed;
        bottom: 0;
        left: 0;
        width: 100%;
        background-color: #f5f5f5;
        padding: 12px 20px;
        text-align: center;
        font-size: 14px;
        color: #666;
        border-top: 1px solid #e0e0e0;
        z-index: 999;
    }
    .bottom-banner a {
        color: #7c3aed;
        text-decoration: none;
        font-weight: 500;
    }
    .bottom-banner a:hover {
        text-decoration: underline;
    }
    
    /* Add padding to main content to prevent overlap with banner */
    .main .block-container {
        padding-bottom: 60px;
    }
    </style>
    
    <div class="bottom-banner">
        By the chads at <a href="https://stationx.network" target="_blank">@stationx.network</a> | <a href="https://t.co/okEHVUcbRW" target="_blank">Join Deal sharing chat 
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: inline-block; vertical-align: middle; margin-left: 4px;">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.38 15.84 14.22 15.51 15.99C15.37 16.74 15.09 16.99 14.83 17.01C14.25 17.06 13.81 16.62 13.25 16.24C12.37 15.65 11.87 15.27 11.02 14.7C10.03 14.04 10.67 13.66 11.24 13.07C11.39 12.92 14.01 10.53 14.06 10.31C14.07 10.28 14.08 10.19 14.03 10.14C13.98 10.09 13.91 10.11 13.86 10.12C13.79 10.15 12.51 11.03 10.03 12.76C9.67 13 9.34 13.12 9.03 13.11C8.69 13.1 8.05 12.91 7.57 12.75C6.98 12.56 6.51 12.45 6.55 12.12C6.57 11.95 6.82 11.78 7.29 11.6C9.95 10.48 11.72 9.74 12.61 9.37C15.14 8.34 15.67 8.16 16.02 8.15C16.1 8.15 16.28 8.17 16.4 8.27C16.5 8.35 16.53 8.46 16.54 8.54C16.53 8.6 16.55 8.76 16.64 8.8Z" fill="#7c3aed"/>
        </svg>
        </a>
    </div>
""", unsafe_allow_html=True)

st.title("Devconnect Chatbot 🤖")
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