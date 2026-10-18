#!/usr/bin/env bash
# 下载 CC0/免费测试图（Pexels License：免费可商用，无需署名）
# 存到 imgs/regression/，按品类命名
set -u
cd /sandboxdata/workspace/file/aict_v837
mkdir -p imgs/regression

dl() {
  local id="$1" name="$2"
  local url="https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?w=800"
  local out="imgs/regression/${name}.jpg"
  if [ -f "$out" ]; then return 0; fi
  local code=$(curl -sL -o "$out" "$url" --max-time 20 -w "%{http_code}" 2>/dev/null)
  if [ "$code" = "200" ] && file "$out" | grep -q "JPEG"; then
    echo "  OK  $name (id=$id)"
  else
    echo "  FAIL $name (id=$id, http=$code)"
    rm -f "$out"
  fi
}

echo "=== 人像正面 ==="
dl 614819 portrait_front_1
dl 774909 portrait_front_2
dl 1043471 portrait_front_3
dl 1559486 portrait_front_4
dl 2747449 portrait_front_5
dl 1065087 portrait_front_6
dl 1222271 portrait_front_7
dl 1121796 portrait_front_8
dl 733872 portrait_front_9
dl 2379005 portrait_front_10
dl 3310694 portrait_front_11
dl 1858175 portrait_front_12

echo "=== 人像侧脸 ==="
dl 551631 portrait_side_1
dl 912059 portrait_side_2
dl 1486785 portrait_side_3
dl 33041 portrait_side_4
dl 123929 portrait_side_5
dl 175542 portrait_side_6
dl 762020 portrait_side_7
dl 1121796 portrait_side_8
dl 1858175 portrait_side_9
dl 2379005 portrait_side_10
dl 3310694 portrait_side_11
dl 2747449 portrait_side_12

echo "=== 多人/群像 ==="
dl 3186504 group_1
dl 1595385 group_2
dl 1468709 group_3
dl 1170412 group_4
dl 1595391 group_5
dl 2422915 group_6
dl 1024248 group_7
dl 1595394 group_8
dl 1128318 group_9
dl 1470419 group_10
dl 2466869 group_11
dl 1699154 group_12

echo "=== 街拍 ==="
dl 3137690 street_1
dl 2246476 street_2
dl 338515 street_3
dl 1123982 street_4
dl 1486222 street_5
dl 324530 street_6
dl 207574 street_7
dl 3137690 street_8
dl 169190 street_9
dl 1918291 street_10
dl 374710 street_11
dl 2832020 street_12

echo "=== 美食 ==="
dl 1640777 food_1
dl 70497 food_2
dl 1279330 food_3
dl 1633578 food_4
dl 1092730 food_5
dl 1565982 food_6
dl 1640772 food_7
dl 842142 food_8
dl 376464 food_9
dl 621093 food_10
dl 1092730 food_11
dl 1213710 food_12

echo "=== 建筑 ==="
dl 323780 arch_1
dl 1619317 arch_2
dl 3802510 arch_3
dl 1029599 arch_4
dl 208984 arch_5
dl 280229 arch_6
dl 3748147 arch_7
dl 1366919 arch_8
dl 1619317 arch_9
dl 53610 arch_10
dl 220769 arch_11
dl 3530096 arch_12

echo "=== 水景 ==="
dl 1530423 water_1
dl 1287460 water_2
dl 1430818 water_3
dl 1666021 water_4
dl 1470502 water_5
dl 15286 water_6
dl 2833771 water_7
dl 1430818 water_8
dl 1322075 water_9
dl 1519530 water_10
dl 1366919 water_11
dl 2832020 water_12

echo "=== 宠物 ==="
dl 1108099 pet_1
dl 45201 pet_2
dl 1805164 pet_3
dl 1170986 pet_4
dl 1490908 pet_5
dl 57416 pet_6
dl 2607544 pet_7
dl 1741374 pet_8
dl 1108099 pet_9
dl 45201 pet_10
dl 1805164 pet_11
dl 1170986 pet_12

echo "=== 古建 ==="
dl 2422915 ancient_1
dl 3530096 ancient_2
dl 1614018 ancient_3
dl 338515 ancient_4
dl 1519088 ancient_5
dl 1619317 ancient_6
dl 280229 ancient_7
dl 53610 ancient_8
dl 220769 ancient_9
dl 1029599 ancient_10
dl 208984 ancient_11
dl 323780 ancient_12

echo "=== 夜景 ==="
dl 1519088 night_1
dl 378557 night_2
dl 2832020 night_3
dl 1366366 night_4
dl 3131718 night_5
dl 2246918 night_6
dl 374710 night_7
dl 1918291 night_8
dl 169190 night_9
dl 207574 night_10
dl 324530 night_11
dl 1486222 night_12

echo "=== 逆光 ==="
dl 551631 backlit_1
dl 33041 backlit_2
dl 912059 backlit_3
dl 1486785 backlit_4
dl 123929 backlit_5
dl 175542 backlit_6
dl 762020 backlit_7
dl 1530423 backlit_8
dl 1287460 backlit_9
dl 1666021 backlit_10
dl 1470502 backlit_11
dl 15286 backlit_12

echo "=== 室内弱光 ==="
dl 261579 indoor_1
dl 1571460 indoor_2
dl 1470171 indoor_3
dl 1123262 indoor_4
dl 260605 indoor_5
dl 1565982 indoor_6
dl 1640777 indoor_7
dl 842142 indoor_8
dl 621093 indoor_9
dl 376464 indoor_10
dl 70497 indoor_11
dl 1213710 indoor_12

echo "=== 天空云 ==="
dl 957040 sky_1
dl 531764 sky_2
dl 459223 sky_3
dl 158163 sky_4
dl 553235 sky_5
dl 531764 sky_6
dl 957040 sky_7
dl 459223 sky_8
dl 15286 sky_9
dl 1530423 sky_10
dl 1287460 sky_11
dl 1666021 sky_12

echo "=== 引导线构图 ==="
dl 3748147 leading_1
dl 1029599 leading_2
dl 2246476 leading_3
dl 280229 leading_4
dl 1430818 leading_5
dl 323780 leading_6
dl 1619317 leading_7
dl 208984 leading_8
dl 1366919 leading_9
dl 3802510 leading_10
dl 53610 leading_11
dl 220769 leading_12

echo ""
echo "=== 下载完成，统计 ==="
ls imgs/regression/ | wc -l
echo "张图片"
