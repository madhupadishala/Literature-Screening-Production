import pandas as pd
import streamlit as st

from components.cards.compact_card import render_card
from engines.search_engine.search_engine import execute_literature_search
from nexus_platform.audit import add_audit_log


def render():
    st.markdown("## Search Workspace")
    st.caption("Retrieve literature hits, normalize metadata, and prepare the queue for screening.")

    records = st.session_state.get("records", pd.DataFrame())
    queue_count = 0

    if isinstance(records, pd.DataFrame) and not records.empty and "Current_Stage" in records.columns:
        queue_count = len(records[records["Current_Stage"] == "Hits"])

    top1, top2, top3, top4 = st.columns(4)

    with top1:
        render_card("Search Job", "Ready", "Configured search execution", "READY")

    with top2:
        render_card("Knowledge", "Loaded", "SOPs / Rules / Products", "OK")

    with top3:
        render_card("Output Template", "Configured", "Line listing template", "OK")

    with top4:
        render_card("Hits Queue", queue_count, "Ready for screening", "LIVE")

    st.markdown("---")

    left, middle, right = st.columns([1.25, 1, 1])

    with left:
        st.markdown("<div class='workspace-panel'>", unsafe_allow_html=True)
        st.markdown("<div class='workspace-header'>Search Profile</div>", unsafe_allow_html=True)

        query = st.text_area(
            "Boolean Search String",
            placeholder='Example: paracetamol AND ("adverse event" OR toxicity)',
            height=120,
            key="search_workspace_query"
        )

        st.markdown("</div>", unsafe_allow_html=True)

    with middle:
        st.markdown("<div class='workspace-panel'>", unsafe_allow_html=True)
        st.markdown("<div class='workspace-header'>Product & Source</div>", unsafe_allow_html=True)

        product = st.text_input("Product", placeholder="Paracetamol", key="search_workspace_product")
        product_id = st.text_input("Product ID", placeholder="PID-001", key="search_workspace_product_id")
        source = st.selectbox("Source", ["PubMed"], key="search_workspace_source")

        st.markdown("</div>", unsafe_allow_html=True)

    with right:
        st.markdown("<div class='workspace-panel'>", unsafe_allow_html=True)
        st.markdown("<div class='workspace-header'>Execution</div>", unsafe_allow_html=True)

        limit = st.selectbox("Maximum PMIDs", [20, 50, 100, 250, 500], index=1, key="search_workspace_limit")

        st.markdown(
            """
            <div class='kv-row'>
                <span class='kv-label'>Mode</span>
                <span class='kv-value'>Assisted</span>
            </div>
            <div class='kv-row'>
                <span class='kv-label'>Template</span>
                <span class='kv-value'>Configured</span>
            </div>
            <div class='kv-row'>
                <span class='kv-label'>QC Handoff</span>
                <span class='kv-value'>Enabled</span>
            </div>
            """,
            unsafe_allow_html=True
        )

        execute = st.button("▶ Execute Search Job", type="primary", use_container_width=True)

        st.markdown("</div>", unsafe_allow_html=True)

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

    st.markdown("### Pipeline Queue")

    records = st.session_state.get("records", pd.DataFrame())

    if not isinstance(records, pd.DataFrame) or records.empty:
        st.info("No search results available. Execute a search job to populate the Hits queue.")
        return

    if "Current_Stage" in records.columns:
        hits_df = records[records["Current_Stage"] == "Hits"]
    else:
        hits_df = records

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

    st.markdown(
        f"<div class='queue-summary'><span>{len(hits_df)} article(s) in Hits queue</span><span>Next: Screening Workspace</span></div>",
        unsafe_allow_html=True
    )

    st.dataframe(
        hits_df[available_cols],
        use_container_width=True,
        hide_index=True,
        height=420
    )
