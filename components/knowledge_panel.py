import os
import streamlit as st

KB_DIR = "knowledge"
ALLOWED_EXTENSIONS = (".md", ".txt", ".csv", ".pdf", ".docx", ".xlsx")

def get_files():
    files_found = []

    if not os.path.exists(KB_DIR):
        return files_found

    for root, dirs, files in os.walk(KB_DIR):
        for file in files:
            if file.lower().endswith(ALLOWED_EXTENSIONS):
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, KB_DIR).replace("\\", "/")
                files_found.append(rel_path)

    return sorted(files_found)

def render_knowledge_panel():
    st.markdown(
        """
        <div class='kb-head'>
            🤖 AI KNOWLEDGE COPILOT
        </div>
        """,
        unsafe_allow_html=True
    )

    with st.container(border=True):
        query = st.text_input(
            "Filter docs",
            placeholder="Filter SOPs, rules, products...",
            label_visibility="collapsed",
            key="kb_filter"
        )

        files = get_files()

        if query:
            q = query.lower().strip()
            files = [f for f in files if q in f.lower()]

        st.caption(f"{len(files)} file(s) found")

        if not files:
            st.info("No knowledge files found.")
            return

        selected = st.selectbox(
            "Knowledge files",
            files,
            key=f"kb_select_{query}"
        )

        file_path = os.path.join(KB_DIR, selected)

        st.markdown(f"**📄 {selected}**")

        if selected.lower().endswith((".md", ".txt", ".csv")):
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()

                st.text_area(
                    "Preview",
                    value=content,
                    height=360,
                    label_visibility="collapsed"
                )
            except Exception as e:
                st.error(f"Unable to read file: {e}")
        else:
            st.info("File indexed. Preview for PDF/DOCX/XLSX will be added later.")
