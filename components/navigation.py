import streamlit as st
from config.constants import PAGES
from platform.audit import add_audit_log

def render_navigation():
    st.markdown("<div class='nav-wrap'>", unsafe_allow_html=True)

    cols = st.columns(len(PAGES))

    for col, page_name in zip(cols, PAGES.keys()):
        with col:
            active = st.session_state.get("page", "Dashboard") == page_name

            if active:
                st.markdown(
                    f"<div class='nav-item nav-active'>{page_name}</div>",
                    unsafe_allow_html=True
                )
            else:
                if st.button(page_name, key=f"nav_{page_name}", use_container_width=True):
                    st.session_state.page = page_name
                    add_audit_log("Navigation", "Page", "", page_name)
                    st.rerun()

    st.markdown("</div>", unsafe_allow_html=True)
