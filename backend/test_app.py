import asyncio
import os
import sys

print("Checking Python environment...")
print("Python:", sys.version)

try:
    import fastapi
    print("FastAPI:", fastapi.__version__)
    import sqlalchemy
    print("SQLAlchemy:", sqlalchemy.__version__)
    import fitz
    print("PyMuPDF:", fitz.__version__)
    import docx
    print("python-docx OK")
    import chardet
    print("chardet OK")
    import reportlab
    print("reportlab OK")
    import openpyxl
    print("openpyxl OK")
    import google.generativeai as genai
    print("google-generativeai OK")

    from main import app
    print("GradeWise FastAPI app loaded successfully!")
    from database import create_tables

    async def init():
        print("Testing create_tables()...")
        await create_tables()
        print("Tables created & seeded successfully!")

    asyncio.run(init())
    print("ALL BACKEND CHECKS PASSED!")
except Exception as e:
    import traceback
    traceback.print_exc()
    sys.exit(1)
