import streamlit as st

from core.state import init_state
from core.router import render_current_page
from components.header import render_header
from components.navigation import render_navigation
from components.knowledge_panel import render_knowledge_panel

st.set_page_config(
    page_title="ClinixAI Literature Screening",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

st.markdown("""
<style>
[data-testid="stSidebar"] {display:none !important;}
[data-testid="stSidebarNav"] {display:none !important;}
#MainMenu {visibility:hidden !important;}
header {visibility:hidden !important;}
footer {visibility:hidden !important;}

.block-container {
    padding-top:0.5rem !important;
    padding-left:1rem !important;
    padding-right:1rem !important;
    max-width:100% !important;
}

div[data-testid="stHorizontalBlock"] {
    gap:0.5rem !important;
}

div[data-testid="stVerticalBlock"] {
    gap:0.4rem !important;
}
</style>
""", unsafe_allow_html=True)

def main():
    init_state()

    render_header()
    render_navigation()

    main_col, copilot_col = st.columns([2.25, 1])

    with main_col:
        try:
            render_current_page()
        except Exception as e:
            st.error("Application page failed to load.")
            st.exception(e)

    with copilot_col:
        render_knowledge_panel()

if __name__ == "__main__":
    main()
