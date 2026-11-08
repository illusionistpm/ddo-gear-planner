from bs4 import BeautifulSoup

from filigree_pages import get_filigree_subpages


def test_get_filigree_subpages_follows_sentient_weapon_subpages_only():
    soup = BeautifulSoup('''
        <div id="mw-content-text">
          <a href="/page/Sentient_Weapon/Filigrees">self</a>
          <a href="/page/Sentient_Weapon/Filigree_Sets#Melee">sets</a>
          <a href="/page/Sentient_Weapon/Filigree_Sets">sets again</a>
          <a href="/page/Sentient_Weapon/Generation_2">gen</a>
          <a href="/page/Sentient_Weapon">parent</a>
          <a href="/page/Doublestrike">unrelated</a>
          <a href="/index.php?title=Sentient_Weapon/Filigrees&amp;action=edit">edit</a>
          <a href="https://example.com/page/Sentient_Weapon/X">external</a>
        </div>
        <a href="/page/Sentient_Weapon/Outside_Content">outside content</a>
    ''', 'html.parser')

    assert get_filigree_subpages(soup) == [
        'Sentient_Weapon/Filigree_Sets',
        'Sentient_Weapon/Generation_2',
    ]
