import streamlit as st
from config.constants import APP_NAME, APP_TITLE, COLORS
from core.audit import add_audit_log

def render_header():
    col1, col2, col3, col4, col5 = st.columns([1.2, 3, 1.2, 2.2, 1])

    with col1:
        st.markdown(
            f"<div class='app-logo'>{APP_NAME}</div>",
            unsafe_allow_html=True
        )

    with col2:
        st.markdown(
            f"<div class='app-title'>{APP_TITLE}</div>",
            unsafe_allow_html=True
        )

    with col3:
        env = st.session_state.get("env", "PRODUCTION")
        st.markdown(
            f"<div class='env-badge'>{env}</div>",
            unsafe_allow_html=True
        )

    with col4:
        st.markdown(
            f"""
            <div class='user-context'>
                {st.session_state.get("username", "User")} ({st.session_state.get("role", "Role")})<br>
                {st.session_state.get("project", "Literature Review")}
            </div>
            """,
            unsafe_allow_html=True
        )

    with col5:
        if st.button("Sign Out", use_container_width=True):
            add_audit_log("Logout", "System", "", "User signed out")
            st.session_state.logged_in = False
            st.rerun()
