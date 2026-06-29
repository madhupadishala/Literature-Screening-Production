import streamlit as st
import pandas as pd
from datetime import datetime
from config.constants import DEFAULT_ENV, DEFAULT_PROJECT

def init_state():
    defaults = {
        "logged_in": True,
        "username": "Althaf",
        "role": "Super User",
        "env": DEFAULT_ENV,
        "project": DEFAULT_PROJECT,
        "page": "Dashboard",
        "audit_log": [],
    }

    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value

    if "records" not in st.session_state:
        st.session_state.records = demo_records()

def demo_records():
    today = datetime.now().strftime("%Y-%m-%d")

    return pd.DataFrame([
        {
            "PMID": "38912721",
            "Title": "Severe hepatic injury following exposure to Drug A",
            "Product": "Drug A",
            "Company Suspect": "Drug A",
            "Current_Stage": "Intake",
            "Status": "In Review",
            "Outcome": "ICSR",
            "Reviewer": "Madhu",
            "QC": "Pending",
            "Classification": "Literature; Serious",
            "Date": today,
        },
        {
            "PMID": "38912722",
            "Title": "Pregnancy exposure report with no adverse outcome",
            "Product": "Drug C",
            "Company Suspect": "Drug C",
            "Current_Stage": "QC",
            "Status": "QC Pending",
            "Outcome": "Invalid Case",
            "Reviewer": "Asha",
            "QC": "Not Started",
            "Classification": "Literature; Pregnancy Report",
            "Date": today,
        },
    ])
