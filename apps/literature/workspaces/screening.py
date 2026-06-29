import streamlit as st
import pandas as pd
from services.workflow.screening_service import run_screening
from nexus_platform.audit import add_audit_log

def render():
    st.markdown("## Screening")

    df = st.session_state.get("records", pd.DataFrame())

    if df.empty:
        st.warning("No records available. Run Hits first.")
        return

    hits_df = df[df["Current_Stage"] == "Hits"] if "Current_Stage" in df.columns else df

    st.markdown(f"**Pending screening:** {len(hits_df)}")

    if hits_df.empty:
        st.success("No records pending screening.")
        return

    st.dataframe(
        hits_df[[c for c in ["PMID", "Title", "Status", "Product"] if c in hits_df.columns]],
        use_container_width=True,
        hide_index=True,
        height=260
    )

    if st.button("🚀 Run AI Screening", type="primary", use_container_width=True):
        with st.spinner("Running AI screening logic..."):
            screened = run_screening(hits_df)

            remaining = df[df["Current_Stage"] != "Hits"] if "Current_Stage" in df.columns else pd.DataFrame()
            st.session_state.records = pd.concat([remaining, screened], ignore_index=True)

            add_audit_log("AI Screening", "Records", "", f"{len(screened)} screened")
            st.success(f"{len(screened)} records screened.")
            st.rerun()
