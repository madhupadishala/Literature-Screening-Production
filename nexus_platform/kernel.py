import streamlit as st

from nexus_platform.state import init_state
from nexus_platform.styles import load_styles
from nexus_platform.router import render_current_page

from components.header import render_header
from components.navigation import render_navigation
from components.knowledge_panel import render_knowledge_panel

def configure_runtime():
    st.set_page_config(
        page_title="ClinixAI Nexus",
        page_icon="🛡️",
        layout="wide",
        initial_sidebar_state="collapsed"
    )

def boot():
    configure_runtime()
    load_styles()
    init_state()

    render_header()
    render_navigation()

    main_col, copilot_col = st.columns([2.25, 1])

    with main_col:
        render_current_page()

    with copilot_col:
        render_knowledge_panel()
