from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def test_student_html_bilingual():
    h=(ROOT/"static/student.html").read_text(encoding="utf-8")
    for ja,en in [
        ("学籍番号","Student ID"),("姓（カタカナ）","Family Name"),
        ("名（カタカナ）","Given Name"),("座席番号","Seat Number"),
        ("参加・画面共有開始","Join & Share Screen"),("挙手","Raise Hand"),
        ("教師画面","Teacher Screen"),("送信","Send")
    ]:
        assert ja in h and en in h
def test_student_dynamic_messages_bilingual():
    j=(ROOT/"static/student.js").read_text(encoding="utf-8")
    for en in ["Unable to join","Screen sharing stopped","Preparing","Class has ended","Message sent to teacher"]:
        assert en in j
