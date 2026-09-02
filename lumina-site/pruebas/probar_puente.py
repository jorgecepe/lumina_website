"""Prueba la pantalla del aviso de cambio de marca contra el sitio publicado.

Comprueba lo que no se ve en el HTML: que el salto ocurra, que el contador
avance y que el botón lo detenga. Se corre después de cada despliegue que toque
la pantalla, y sobre todo el día que los 307 se reemplacen por el 301
definitivo.

    py pruebas/probar_puente.py

Requiere playwright (`pip install playwright && playwright install chromium`).
"""

from playwright.sync_api import sync_playwright

URL_ES = "https://www.luminaconsulting.ai/somos-inflexia"
URL_EN = "https://www.luminaconsulting.ai/en/we-are-now-inflexia"
DESTINO = "https://inflexia.cl/"

fallas = []


def revisar(nombre, condicion, detalle=""):
    print(("ok    " if condicion else "FALLA ") + nombre + (" " + detalle if detalle else ""))
    if not condicion:
        fallas.append(nombre)


with sync_playwright() as p:
    navegador = p.chromium.launch()

    # 1. El salto automático llega a inflexia.cl
    pagina = navegador.new_page()
    pagina.goto(URL_ES, wait_until="domcontentloaded")
    texto_inicial = pagina.inner_text("#tiempo")
    pagina.wait_for_url(DESTINO + "**", timeout=15000)
    revisar("salta solo a inflexia.cl", pagina.url.startswith(DESTINO), f"({pagina.url})")
    revisar("el contador arranca en 6", "6" in texto_inicial, f"({texto_inicial.strip()})")
    pagina.close()

    # 2. El contador avanza
    pagina = navegador.new_page()
    pagina.goto(URL_ES, wait_until="domcontentloaded")
    pagina.wait_for_timeout(2500)
    cuenta = pagina.inner_text("#cuenta")
    revisar("el contador avanza", cuenta in ("3", "4"), f"(marca {cuenta})")

    # 3. El botón detiene el salto, que es lo que pide WCAG 2.2.1
    pagina.click("#detener")
    detenido = pagina.inner_text("#tiempo").strip()
    pagina.wait_for_timeout(6000)
    revisar("el botón detiene el salto", pagina.url == URL_ES, f"({pagina.url})")
    revisar("avisa que quedó detenido", "detenida" in detenido.lower(), f"({detenido})")
    revisar("el botón desaparece al detener", pagina.is_hidden("#detener"))
    pagina.close()

    # 4. La versión en inglés
    pagina = navegador.new_page()
    pagina.goto(URL_EN, wait_until="domcontentloaded")
    revisar("la versión en inglés declara lang=en", pagina.get_attribute("html", "lang") == "en")
    pagina.wait_for_url(DESTINO + "**", timeout=15000)
    revisar("la versión en inglés también salta", pagina.url.startswith(DESTINO))
    pagina.close()

    navegador.close()

print()
print("sin fallas" if not fallas else f"fallas: {fallas}")
raise SystemExit(1 if fallas else 0)
