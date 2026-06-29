import streamlit as st

def three_column():
    return st.columns([1, 1, 1])

def two_column(left=1, right=1):
    return st.columns([left, right])

def main_with_assistant():
    return st.columns([2.4, 1])
