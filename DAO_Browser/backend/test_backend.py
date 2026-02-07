"""
Test script to verify the summarization backend is working correctly
"""

import requests
import json

def test_backend():
    print("=" * 60)
    print("Testing AI Summarization Backend")
    print("=" * 60)
    print()
    
    # Test 1: Health Check
    print("Test 1: Health Check...")
    try:
        response = requests.get('http://localhost:5000/health', timeout=5)
        if response.status_code == 200:
            print("✅ Backend server is running!")
            print(f"   Response: {response.json()}")
        else:
            print(f"❌ Server returned status code: {response.status_code}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"❌ Cannot connect to backend server")
        print(f"   Error: {e}")
        print()
        print("💡 Make sure to start the backend server:")
        print("   cd backend")
        print("   python summarizer.py")
        return False
    
    print()
    
    # Test 2: Summarization
    print("Test 2: Article Summarization...")
    test_article = """
    Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural 
    intelligence displayed by humans and animals. Leading AI textbooks define the field as the study 
    of "intelligent agents": any device that perceives its environment and takes actions that maximize 
    its chance of successfully achieving its goals. Colloquially, the term "artificial intelligence" 
    is often used to describe machines that mimic "cognitive" functions that humans associate with the 
    human mind, such as "learning" and "problem solving". As machines become increasingly capable, tasks 
    considered to require "intelligence" are often removed from the definition of AI, a phenomenon known 
    as the AI effect. A quip in Tesler's Theorem says "AI is whatever hasn't been done yet."
    
    Modern machine learning is a subdiscipline of AI and focuses on the development of computer programs 
    that can access data and use it to learn for themselves. The process of learning begins with 
    observations or data, such as examples, direct experience, or instruction, in order to look for 
    patterns in data and make better decisions in the future based on the examples that we provide. 
    The primary aim is to allow the computers learn automatically without human intervention or assistance 
    and adjust actions accordingly. Deep learning is part of a broader family of machine learning methods 
    based on artificial neural networks with representation learning.
    
    AI research has been divided into subfields that focus on specific problems or on specific approaches 
    or on the use of a particular tool or towards the accomplishment of particular applications. The 
    traditional problems (or goals) of AI research include reasoning, knowledge representation, planning, 
    learning, natural language processing, perception and the ability to move and manipulate objects. 
    General intelligence is among the field's long-term goals. Approaches include statistical methods, 
    computational intelligence, and traditional symbolic AI.
    """
    
    try:
        payload = {
            "text": test_article,
            "sentences": 3
        }
        
        response = requests.post(
            'http://localhost:5000/summarize',
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=10
        )
        
        if response.status_code == 200:
            print("✅ Summarization successful!")
            result = response.json()
            print()
            print("Summary Results:")
            print(f"   Original Length: {result['original_length']} characters")
            print(f"   Summary Length: {result['summary_length']} characters")
            print(f"   Sentences: {result['sentences_count']}")
            print()
            print("Generated Summary:")
            for i, sentence in enumerate(result['summary'], 1):
                print(f"   {i}. {sentence}")
        else:
            print(f"❌ Summarization failed with status code: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Summarization request failed")
        print(f"   Error: {e}")
        return False
    
    print()
    print("=" * 60)
    print("✅ All tests passed! Backend is working correctly!")
    print("=" * 60)
    return True

if __name__ == '__main__':
    test_backend()
