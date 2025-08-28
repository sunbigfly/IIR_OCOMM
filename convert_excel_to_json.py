#!/usr/bin/env python3
"""
将Excel文件转换为JSON格式，用于静态网页应用
"""

import pandas as pd
import json
import sys
from pathlib import Path

def convert_excel_to_json():
    """将Excel文件转换为JSON格式"""
    try:
        # 读取Excel文件
        df = pd.read_excel('IIR_OCOMM-非活性成分字段描述.xlsx')
        
        print(f"读取到 {len(df)} 行数据")
        
        # 处理NaN值，将其转换为None
        df = df.where(pd.notnull(df), None)

        # 替换inf和-inf值
        df = df.replace([float('inf'), float('-inf')], None)
        
        # 转换为字典列表
        data = df.to_dict('records')
        
        # 创建输出目录
        output_dir = Path('web_app')
        output_dir.mkdir(exist_ok=True)
        
        # 保存为JSON文件
        json_file = output_dir / 'data.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2, default=str)
        
        print(f"数据已保存到: {json_file}")
        
        # 创建字段映射信息
        field_mapping = {
            'INGREDIENT_NAME': {
                'en': 'INGREDIENT_NAME',
                'cn': 'INGREDIENT_NAME(中文名)',
                'display': '成分名称'
            },
            'ROUTE': {
                'en': 'ROUTE',
                'cn': 'ROUTE(中文名)',
                'display': '给药途径',
                'explanation': 'ROUTE 解释说明 (Explanation)'
            },
            'DOSAGE_FORM': {
                'en': 'DOSAGE_FORM',
                'cn': 'DOSAGE_FORM(中文名)',
                'display': '剂型',
                'explanation': 'DOSAGE_FORM 解释说明 (Explanation)'
            },
            'CAS_NUMBER': {
                'field': 'CAS_NUMBER',
                'display': 'CAS号'
            },
            'UNII': {
                'field': 'UNII',
                'display': 'UNII'
            },
            'POTENCY_AMOUNT': {
                'field': 'POTENCY_AMOUNT',
                'display': '效价量'
            },
            'POTENCY_UNIT': {
                'field': 'POTENCY_UNIT',
                'display': '效价单位'
            },
            'MAXIMUM_DAILY_EXPOSURE': {
                'field': 'MAXIMUM_DAILY_EXPOSURE',
                'display': '最大日暴露量'
            },
            'MAXIMUM_DAILY_EXPOSURE_UNIT': {
                'field': 'MAXIMUM_DAILY_EXPOSURE_UNIT',
                'display': '最大日暴露量单位'
            },
            'RECORD_UPDATED': {
                'field': 'RECORD_UPDATED',
                'display': '记录更新时间'
            }
        }
        
        # 保存字段映射
        mapping_file = output_dir / 'field_mapping.json'
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(field_mapping, f, ensure_ascii=False, indent=2)
        
        print(f"字段映射已保存到: {mapping_file}")
        
        # 统计信息
        stats = {
            'total_records': len(df),
            'unique_ingredients': df['INGREDIENT_NAME'].nunique(),
            'unique_routes': df['ROUTE'].nunique(),
            'unique_dosage_forms': df['DOSAGE_FORM'].nunique(),
            'columns': list(df.columns)
        }
        
        stats_file = output_dir / 'stats.json'
        with open(stats_file, 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)
        
        print(f"统计信息已保存到: {stats_file}")
        print(f"总记录数: {stats['total_records']}")
        print(f"唯一成分数: {stats['unique_ingredients']}")
        print(f"唯一给药途径数: {stats['unique_routes']}")
        print(f"唯一剂型数: {stats['unique_dosage_forms']}")
        
        return True
        
    except Exception as e:
        print(f"转换过程中出错: {e}")
        return False

if __name__ == "__main__":
    success = convert_excel_to_json()
    sys.exit(0 if success else 1)
