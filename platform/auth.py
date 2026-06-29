import streamlit as st

DEMO_USERS = {
    "althaf": {"name": "Althaf", "role": "Super User"},
    "madhu": {"name": "Madhu", "role": "Reviewer"},
    "qc": {"name": "QC User", "role": "QC Reviewer"},
}

def check_login():
    return st.session_state.get("logged_in", True)

def render_login():
    st.markdown("## ClinixAI Login")
    username = st.text_input("Username")
    password = st.text_input("Password", type="password")

    if st.button("Login", type="primary"):
        key = username.strip().lower()
        if key in DEMO_USERS and password:
            st.session_state.logged_in = True
            st.session_state.username = DEMO_USERS[key]["name"]
            st.session_state.role = DEMO_USERS[key]["role"]
            st.rerun()
        else:
            st.error("Invalid login.")
