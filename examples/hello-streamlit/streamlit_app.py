"""
A throwaway Streamlit app for testing Hatch deploys end-to-end.
"""
import datetime as dt
import streamlit as st
import pandas as pd
import numpy as np

st.set_page_config(page_title="Hello Hatch", page_icon="🐣", layout="wide")

st.title("Hello, Hatch.")
st.caption(
    "If you're reading this from a teammate's laptop, the whole stack is working."
)

st.write(
    f"Rendered at **{dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}** "
    f"by the container running on Mike's laptop."
)

# Fake reporting-style chart so the demo feels PM-shaped.
days = pd.date_range(end=dt.date.today(), periods=30)
data = pd.DataFrame(
    {
        "active users": np.cumsum(np.random.randn(30)) + 200,
        "signups":      np.cumsum(np.random.randn(30) * 0.5) + 40,
    },
    index=days,
)
st.line_chart(data)

st.subheader("Why this exists")
st.markdown(
    """
- You vibe-coded this in Claude Code over your reporting data.
- You said "deploy this and share with Sarah."
- The container ran here. Sarah opened a tailnet URL. Done.
"""
)
