from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / 'static'


def test_teacher_menu_and_focus_contract():
    html = (STATIC / 'teacher.html').read_text(encoding='utf-8')
    assert 'id="seatGrid"' in html
    assert 'id="focusOverlay"' in html
    assert 'id="focusIncoming"' in html
    assert 'id="menuHandle"' in html
    assert html.index('id="endClassBtn"') > html.index('id="shareTeacherBtn"')


def test_student_ui_has_only_teacher_facing_reactions():
    html = (STATIC / 'student.html').read_text(encoding='utf-8')
    for control in ['handBtn', 'yesBtn', 'noBtn', 'msgBtn']:
        assert f'id="{control}"' in html
    assert 'teacherVideo' in html
    assert '他の学生' not in html
    assert 'student-roster' not in html


def test_seat_number_formula_and_mandatory_capture_are_present():
    teacher_js = (STATIC / 'teacher.js').read_text(encoding='utf-8')
    student_js = (STATIC / 'student.js').read_text(encoding='utf-8')
    assert 'col * rows + (rows - row)' in teacher_js
    assert '授業に参加するには画面共有を開始してください' in student_js
    assert "setInterval(()=>sendWs({type:'heartbeat'}),2000)" in student_js
