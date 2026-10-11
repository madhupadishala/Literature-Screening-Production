"""WSGI application import for manual Render staging deployment."""
from .service import create_application

application = create_application()
