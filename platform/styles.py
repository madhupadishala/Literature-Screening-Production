from pathlib import Path
import streamlit as st

CSS_FILES = [
    "assets/css/streamlit_override.css",
    "assets/css/base.css",
    "assets/css/layout.css",
    "assets/css/components.css",
    "assets/css/pages.css",
]

def load_styles():
    css = ""

    for css_file in CSS_FILES:
        path = Path(css_file)

        if path.exists():
            css += path.read_text(encoding="utf-8") + "\n"

    if css:
        st.markdown(
            f"<style>{css}</style>",
            unsafe_allow_html=True
        )
