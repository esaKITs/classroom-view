import importlib.util, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("a10server",ROOT/"server.py")
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def test_round_table_default_18():
    l=m.round_table_layout(2,3)
    assert l["type"]=="round_tables"
    assert len(l["tables"])==6
    assert m.valid_seats(l)==set(range(1,19))
    # front-left table is 01,02,03; rear-left is 10,11,12
    front=next(t for t in l["tables"] if t["row"]==1 and t["col"]==0)
    rear=next(t for t in l["tables"] if t["row"]==0 and t["col"]==0)
    assert front["seats"]==[1,2,3]
    assert rear["seats"]==[10,11,12]

def test_round_table_seat_positions():
    l=m.round_table_layout(2,3)
    assert m.seat_position(l,1)==[1,0,0]
    assert m.seat_position(l,2)==[1,0,1]
    assert m.seat_position(l,3)==[1,0,2]
    assert m.seat_position(l,18)==[0,2,2]
