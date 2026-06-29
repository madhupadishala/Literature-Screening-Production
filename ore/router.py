import importlib
import streamlit as st
from config.constants import PAGES

def get_current_page():
    page = st.session_state.get("page", "Dashboard")

    if page not in PAGES:
        st.session_state.page = "Dashboard"
        return "Dashboard"

    return page

def render_current_page():
    page = get_current_page()
    module_path = PAGES[page]

    module = importlib.import_module(module_path)

    if not hasattr(module, "render"):
        st.error(f"Page module '{module_path}' does not have render().")
        return

    module.render()
