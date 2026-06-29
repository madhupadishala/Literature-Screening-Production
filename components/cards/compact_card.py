import streamlit as st

def render_card(title, value=None, subtitle=None, status=None):
    status_html = f"<span class='card-status'>{status}</span>" if status else ""
    value_html = f"<div class='card-value'>{value}</div>" if value is not None else ""
    subtitle_html = f"<div class='card-subtitle'>{subtitle}</div>" if subtitle else ""

    st.markdown(
        f"""
        <div class='compact-card'>
            <div class='card-header'>
                <span>{title}</span>
                {status_html}
            </div>
            {value_html}
            {subtitle_html}
        </div>
        """,
        unsafe_allow_html=True
    )
