import streamlit as st
import pandas as pd
from services.literature.pubmed import run_pubmed_search
from nexus_platform.audit import add_audit_log

def render():
    st.markdown("## Hits")

    col1, col2, col3 = st.columns(3)

    with col1:
        query = st.text_area(
            "Search String",
            placeholder='Example: paracetamol AND adverse event',
            height=130,
            key="hits_query"
        )

    with col2:
        product = st.text_input("Product Name", placeholder="Paracetamol")
        product_id = st.text_input("Product ID", placeholder="PID-001")

    with col3:
        retmax = st.selectbox("Maximum PMIDs", [20, 50, 100, 250, 500], index=1)
        source = st.selectbox("Source", ["PubMed", "Embase Mock", "Cochrane Mock"])

    if st.button("⚡ Execute Literature Search", type="primary", use_container_width=True):
        if not query.strip():
            st.error("Search string is required.")
            return

        with st.spinner("Searching PubMed and building Hits queue..."):
            try:
                records = run_pubmed_search(query.strip(), retmax=retmax)

                for r in records:
                    r["Product"] = product or "Not Assigned"
                    r["Product ID"] = product_id or "PID-GENERIC"
                    r["Company Suspect"] = product or "Not Assigned"

                df = pd.DataFrame(records)
                st.session_state.records = df
                add_audit_log("Hits Search", "PubMed", "", f"{len(df)} records")
                st.success(f"{len(df)} records loaded into Hits queue.")
                st.rerun()

            except Exception as e:
                st.error(f"Search failed: {e}")

    st.markdown("---")
    st.markdown("### Pipeline Queue")

    df = st.session_state.get("records", pd.DataFrame())

    if df.empty:
        st.info("No records available.")
        return

    hits_df = df[df.get("Current_Stage", "") == "Hits"] if "Current_Stage" in df.columns else df

    display_cols = ["PMID", "Title", "Product", "Company Suspect", "Current_Stage", "Status", "Date"]
    available_cols = [c for c in display_cols if c in hits_df.columns]

    st.dataframe(
        hits_df[available_cols],
        use_container_width=True,
        hide_index=True,
        height=420
    )
