import streamlit as st
from datetime import datetime

def add_audit_log(action, field="", old="", new=""):
    if "audit_log" not in st.session_state:
        st.session_state.audit_log = []

    st.session_state.audit_log.append({
        "Timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "User": st.session_state.get("username", "System"),
        "Environment": st.session_state.get("env", "PRODUCTION"),
        "Action": action,
        "Field": field,
        "Old Value": old,
        "New Value": new,
    })
