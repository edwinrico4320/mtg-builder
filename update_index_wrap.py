import re

with open('index.html', 'r') as f:
    content = f.read()

content = content.replace('<option value="custom">Custom</option>', '<option value="custom">Custom</option>\n                <option value="wrap">Movable image with text wrap</option>')

with open('index.html', 'w') as f:
    f.write(content)
