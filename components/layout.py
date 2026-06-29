import streamlit as st

def page_title(title, subtitle=None):
    st.markdown(
        f"""
        <div class="page-title-wrap">
            <div class="page-title">{title}</div>
            <div class="page-subtitle">{subtitle or ""}</div>
        </div>
        """,
        unsafe_allow_html=True
    )

def section(title, icon=""):
    st.markdown(
        f"""
        <div class="section-title">
            {icon} {title}
        </div>
        """,
        unsafe_allow_html=True
    )

def panel_start(title=None):
    if title:
        st.markdown(
            f"""
            <div class="enterprise-panel">
                <div class="enterprise-panel-title">{title}</div>
            """,
            unsafe_allow_html=True
        )
    else:
        st.markdown('<div class="enterprise-panel">', unsafe_allow_html=True)

def panel_end():
    st.markdown("</div>", unsafe_allow_html=True)

def status_chip(text, status="neutral"):
    return f"<span class='status-chip status-{status}'>{text}</span>"

def metric_card(label, value, tone="blue"):
    st.markdown(
        f"""
        <div class="metric-card metric-{tone}">
            <div class="metric-label">{label}</div>
            <div class="metric-value">{value}</div>
        </div>
        """,
        unsafe_allow_html=True
    )
