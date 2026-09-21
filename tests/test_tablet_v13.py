from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_teacher_landscape_tablet_css_contract():
    css=(ROOT/'static/teacher.css').read_text()
    assert 'orientation: landscape' in css
    assert 'pointer: coarse' in css
    assert 'max-width: 1400px' in css
    assert '-webkit-overflow-scrolling:touch' in css

def test_student_tablet_fallback_contract():
    js=(ROOT/'static/student.js').read_text()
    assert 'detectDevice' in js
    assert "label:'iPad'" in js
    assert "share_capability:cap.ok?'web':(deviceInfo.fallback?'external':'none')" in js
    assert 'タブレット代替モード' in js

def test_teacher_device_badge_contract():
    js=(ROOT/'static/teacher.js').read_text()
    assert "p.device_type==='tablet'" in js
    assert '外部共有待機' in js
