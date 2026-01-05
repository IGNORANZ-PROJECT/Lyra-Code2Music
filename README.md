# Lyra-Code2Music

ブラウザ内でコードを解析し、チップチューンとして再生＆MIDI出力するデモです。  
コードはサーバーに送信されません（Hostingのみ）。

公開URL: https://lyra-code2music.web.app

## 特徴
- ローカル解析のみで、コードの送信なし
- メロ/ベース/ドラムに変換してチップチューン再生
- 同じイベント列から MIDI を生成してダウンロード

## 対応言語
- Python (.py)
- C (.c)
- C++ (.cpp/.cc/.cxx)
- Java (.java)
- C# (.cs)
- JavaScript (.js)

## 必要環境
- Node.js 18+ 推奨
- Firebase CLI（デプロイする場合）: `npm i -g firebase-tools`

## セットアップ
```bash
npm install
```

## 開発サーバー
```bash
npm run dev
```

## ビルドとプレビュー
```bash
npm run build
npm run preview
```

## Firebase Hosting デプロイ
```bash
firebase login
firebase init hosting
# public は dist にする（firebase.jsonは同梱）
npm run build
firebase deploy
```

## 仕組み（ざっくり）
- トークンを抽出してイベント列へ変換
- ドラムは基本パターン、密度でハットが変化
- 言語固有トークンでフレーズを追加
- MIDIを書き出し可能

## 生成方法
- 順番: トークン順に並べ、4小節コード進行のベースを足します
- ランダム: トークンを抽選し、密度で刻みを変えます
- フロー: トークンの処理順に歩幅を進めて再生します

## 使い方のコツ
- 「生成方法」を変えると、同じコードでも雰囲気が大きく変わります
- ループ/分岐/関数呼び出しが多いほど、リズムとフレーズが豊かになります
- 定数や配列の並びがメロディの並びに影響します

## サンプルコード
### Python
```python
from math import sin

class Worker:
    def __init__(self, count=3):
        self.count = count

    async def run(self):
        phrase = []
        for i in range(self.count):
            if i % 2 == 0:
                await sleep(1)
            else:
                await sleep(2)
            phrase.append(i * 2)
        return phrase

async def melody(seed=2):
    w = Worker(count=6)
    notes = await w.run()
    for n in notes:
        if n % seed == 0:
            await sleep(1)
        else:
            await sleep(2)
    return [int(8 + sin(x) * 4) for x in notes]
```

### C
```c
#include <stdio.h>

int main(void) {
    int motif[8] = {0, 2, 4, 7, 9, 7, 4, 2};
    int bass[4] = {0, -5, -7, -12};
    int total = 0;
    for (int i = 0; i < 16; i++) {
        int step = motif[i % 8] + bass[(i / 4) % 4];
        if (i % 2 == 0) {
            sleep(1);
        } else {
            sleep(2);
        }
        total += step;
    }
    switch (total % 4) {
        case 0: total += 2; break;
        case 1: total -= 1; break;
        default: break;
    }
    for (int j = 0; j < 6; j++) {
        total += (j % 2 == 0) ? 1 : -1;
    }
    return 0;
}
```

### C++
```cpp
#include <iostream>

int main() {
    int total = 0;
    int motif[] = {0, 3, 5, 7, 10, 7, 5, 3};
    int bass[] = {0, -5, -7, -12};
    for (int i = 0; i < 12; i++) {
        if (i == 6) continue;
        total += motif[i % 8] + bass[(i / 3) % 4];
    }
    while (total < 8) {
        total++;
    }
    for (int k = 0; k < 8; k++) {
        if (k % 3 == 0) total += 2;
    }
    return total;
}
```

### Java
```java
class Main {
    public static void main(String[] args) {
        int sum = 0;
        int[] scale = {0, 2, 4, 7, 9, 7, 4, 2};
        int[] bass = {0, -5, -7, -12};
        for (int i = 0; i < 12; i++) {
            if (i % 2 == 0) {
                sleep(1);
            } else {
                sleep(2);
            }
            sum += scale[i % scale.length] + bass[(i / 3) % bass.length];
        }
        switch (sum % 5) {
            case 2: sum += 2; break;
            default: break;
        }
        for (int j = 0; j < 6; j++) {
            sum += (j % 2 == 0) ? 1 : -1;
        }
    }
}
```

### C#
```csharp
using System.Threading.Tasks;

class Runner {
    public async Task RunAsync() {
        int[] motif = { 0, 2, 4, 7, 9, 7, 4, 2 };
        int[] bass = { 0, -5, -7, -12 };
        for (int i = 0; i < 12; i++) {
            int step = motif[i % motif.Length] + bass[(i / 3) % bass.Length];
            if (step % 2 == 0) await Task.Delay(80);
            await Task.Delay(100);
        }
        for (int j = 0; j < 6; j++) {
            if (j % 3 == 0) await Task.Delay(60);
        }
    }
}
```

### JavaScript
```javascript
function arpeggio(seed) {
  const base = [0, 3, 5, 7, 10, 7, 5, 3];
  return base.map((n, i) => n + ((i + seed) % 4));
}

async function run() {
  const notes = arpeggio(2);
  const bass = [0, -5, -7, -12];
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      await sleep(1);
    } else {
      await sleep(2);
    }
  }
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i] + bass[Math.floor(i / 2) % bass.length];
    if (n % 3 === 0) setTimeout(() => {}, 140);
    else setTimeout(() => {}, 90);
  }
}
```

## License
MIT License
