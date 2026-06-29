import pandas as pd
import streamlit as st

from engines.search_engine.search_engine import execute_literature_search
from nexus_platform.audit import add_audit_log


def render_status_strip(queue_count: int):
    st.markdown(
        f"""
        <div class="cx-status-strip">
            <div class="cx-status-tab cx-tab-active">Search Job <span>Ready</span></div>
            <div class="cx-status-tab">Knowledge <span>Loaded</span></div>
            <div class="cx-status-tab">Template <span>Configured</span></div>
            <div class="cx-status-tab">Queue <span>{queue_count}</span></div>
        </div>
        """,
        unsafe_allow_html=True
    )


def render():
    records = st.session_state.get("records", pd.DataFrame())

    queue_count = 0
    if isinstance(records, pd.DataFrame) and not records.empty and "Current_Stage" in records.columns:
        queue_count = len(records[records["Current_Stage"] == "Hits"])

    render_status_strip(queue_count)

    st.markdown('<div class="cx-section">', unsafe_allow_html=True)
    st.markdown('<div class="cx-section-ribbon cx-ribbon-search"></div>', unsafe_allow_html=True)
    st.markdown('<div class="cx-section-title">Search Configuration</div>', unsafe_allow_html=True)

    q_col, p_col, e_col = st.columns([6, 3.2, 2.8])

    with q_col:
        query = st.text_area(
            "Boolean Search String",
            placeholder='paracetamol AND ("adverse event" OR toxicity)',
            height=74,
            key="search_workspace_query"
        )

    with p_col:
        product = st.text_input("Product", placeholder="Paracetamol", key="search_workspace_product")
        product_id = st.text_input("Product ID", placeholder="PID-001", key="search_workspace_product_id")
        source = st.selectbox("Source", ["PubMed"], key="search_workspace_source")

    with e_col:
        limit = st.selectbox("Maximum PMIDs", [20, 50, 100, 250, 500], index=1, key="search_workspace_limit")

        st.markdown(
            """
            <div class="cx-kv">
                <div><span>Mode</span><b>Assisted</b></div>
                <div><span>Template</span><b>Configured</b></div>
                <div><span>QC Handoff</span><b>Enabled</b></div>
            </div>
            """,
            unsafe_allow_html=True
        )

        execute = st.button("▶ Execute", type="primary", use_container_width=True)

    st.markdown('</div>', unsafe_allow_html=True)

    if execute:
        if not query.strip():
            st.error("Search string is required.")
            return

        with st.spinner("Executing literature search job..."):
            try:
                result_records = execute_literature_search(
                    query=query,
                    product=product,
                    product_id=product_id,
                    source=source,
                    limit=limit
                )

                df = pd.DataFrame(result_records)
                st.session_state.records = df

                add_audit_log(
                    "Search Job Executed",
                    "Literature Search",
                    "",
                    f"{len(df)} records retrieved from {source}"
                )

                st.success(f"{len(df)} records retrieved and prepared for screening.")
                st.rerun()

            except Exception as error:
                st.error(f"Search execution failed: {error}")

    st.markdown('<div class="cx-section cx-section-queue">', unsafe_allow_html=True)
    st.markdown('<div class="cx-section-ribbon cx-ribbon-pipeline"></div>', unsafe_allow_html=True)
    st.markdown(
        f"""
        <div class="cx-section-title">
            Pipeline Queue
            <span>{queue_count} article(s) in Hits queue · Next: Screening Workspace</span>
        </div>
        """,
        unsafe_allow_html=True
    )

    records = st.session_state.get("records", pd.DataFrame())

    if not isinstance(records, pd.DataFrame) or records.empty:
        empty_df = pd.DataFrame(columns=["PMID", "Title", "Product", "Company Suspect", "Current_Stage", "Status", "Date"])
        st.dataframe(empty_df, use_container_width=True, hide_index=True, height=190)
        st.markdown('</div>', unsafe_allow_html=True)
        return

    hits_df = records[records["Current_Stage"] == "Hits"] if "Current_Stage" in records.columns else records

    display_cols = [
        "PMID",
        "Title",
        "Product",
        "Company Suspect",
        "Current_Stage",
        "Status",
        "Search_Source",
        "Date"
    ]

    available_cols = [col for col in display_cols if col in hits_df.columns]

    st.dataframe(
        hits_df[available_cols],
        use_container_width=True,
        hide_index=True,
        height=260
    )

    st.markdown('</div>', unsafe_allow_html=True)
