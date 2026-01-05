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
    int chord[4] = {0, 2, 5, 7};
    int total = 0;
    for (int i = 0; i < 8; i++) {
        if (i % 2 == 0) {
            sleep(1);
        } else {
            sleep(2);
        }
        total += chord[i % 4];
        if (i == 3) continue;
    }
    switch (total % 3) {
        case 0: break;
        case 1: break;
        default: break;
    }
    for (int j = 0; j < 3; j++) {
        total += j;
    }
    return 0;
}
```

### C++
```cpp
#include <iostream>

int main() {
    int total = 0;
    int motif[] = {1, 2, 3, 2, 1};
    for (int i = 0; i < 6; i++) {
        if (i == 2) break;
        total += motif[i % 5];
    }
    while (total < 12) {
        total++;
    }
    for (int k = 0; k < 4; k++) {
        if (k % 2 == 0) total += k;
    }
    return total;
}
```

### Java
```java
class Main {
    public static void main(String[] args) {
        int sum = 0;
        int[] scale = {0, 2, 4, 7, 9};
        for (int i = 0; i < 8; i++) {
            if (i % 2 == 0) {
                sleep(1);
            } else {
                sleep(2);
            }
            sum += scale[i % scale.length];
        }
        switch (sum % 4) {
            case 3: break;
            default: break;
        }
        for (int j = 0; j < 3; j++) {
            sum += j;
        }
    }
}
```

### C#
```csharp
using System.Threading.Tasks;

class Runner {
    public async Task RunAsync() {
        int[] motif = { 1, 2, 4, 2, 1, 3 };
        foreach (var i in motif) {
            if (i == 2) continue;
            await Task.Delay(100);
        }
        for (int j = 0; j < 4; j++) {
            if (j % 2 == 0) await Task.Delay(80);
        }
    }
}
```

### JavaScript
```javascript
function arpeggio(seed) {
  const base = [0, 4, 7, 11];
  return base.map((n, i) => n + ((i + seed) % 3));
}

async function run() {
  const notes = arpeggio(2);
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      await sleep(1);
    } else {
      await sleep(2);
    }
  }
  for (const n of notes) {
    if (n % 2 === 0) {
      setTimeout(() => {}, 120);
    } else {
      setTimeout(() => {}, 80);
    }
  }
}
```

## License
MIT License
